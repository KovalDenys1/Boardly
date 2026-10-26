import type { Event, init, spanToStaticSpanJSON } from '@sentry/nextjs'

type SpanJSON = ReturnType<typeof spanToStaticSpanJSON>

const PII_KEY_SNIPPETS = ['forwarded', '-ip', 'remote-', 'via', '-user']

// Left unset, @sentry/nextjs 11 sends user info, cookies and HTTP bodies; this is its migration guide's v10 baseline.
export const SENTRY_DATA_COLLECTION: NonNullable<Parameters<typeof init>[0]['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: PII_KEY_SNIPPETS },
    response: { deny: PII_KEY_SNIPPETS },
  },
  httpBodies: [],
  urlQueryParams: { deny: PII_KEY_SNIPPETS },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
}

const QUERY_KEYS = new Set(['query_string', 'http.query', 'url.query', 'http.fragment', 'url.fragment'])
const MAX_DEPTH = 24
const LONG_STRING = 32 * 1024
const SCHEME_LIMIT = 32
const SPACE = /\s/
const SCHEME_CHAR = /[a-z0-9+.-]/i
const PATH_OPENERS = new Set(['"', "'", '`', '(', '[', '{', '<', '=', ',', ';', ':', '|'])

function endsUrl(char: string): boolean {
  return char === '"' || char === "'" || char === '`' || char === '<' || char === '>' || SPACE.test(char)
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9'
}

interface UrlStart {
  start: number
  path: number
}

function urlAt(text: string, i: number): UrlStart | null {
  if (text[i] === ':' && text[i + 1] === '/' && text[i + 2] === '/') {
    let start = i
    while (start > 0 && i - start < SCHEME_LIMIT && SCHEME_CHAR.test(text[start - 1])) start--
    return start < i ? { start, path: i + 3 } : null
  }
  if (text[i] === '/' && (i === 0 || PATH_OPENERS.has(text[i - 1]) || SPACE.test(text[i - 1]))) {
    return { start: i, path: i + 1 }
  }
  return null
}

function inStackFrame(text: string, start: number): boolean {
  if (start === 0) return true
  const before = text[start - 1]
  return before === '(' || before === '@' || text.slice(start - 3, start) === 'at '
}

// Start of a `:line` or `:line:col` that ends at `tail` and begins after the query mark, or -1.
function framePosition(text: string, query: number, tail: number): number {
  let position = -1
  let cursor = tail
  for (let groups = 0; groups < 2; groups++) {
    let digits = cursor
    while (digits > query && isDigit(text[digits - 1])) digits--
    if (digits === cursor || digits - 1 <= query || text[digits - 1] !== ':') break
    cursor = digits - 1
    position = cursor
  }
  return position
}

// Where the kept part after a cut query begins: a stack frame keeps its position and its closing parenthesis.
function keptTail(text: string, url: UrlStart, query: number, end: number): number {
  const closesFrame = text[end - 1] === ')' && text[url.start - 1] === '('
  const tail = closesFrame ? end - 1 : end
  const atFrameEnd = closesFrame || end === text.length || text[end] === '\n' || text[end] === '\r'
  if (atFrameEnd && inStackFrame(text, url.start)) {
    const position = framePosition(text, query, tail)
    if (position !== -1) return position
  }
  return tail
}

function cutAtFirstQuery(text: string): string {
  for (let i = 0; i < text.length; i++) {
    const url = urlAt(text, i)
    if (!url) continue
    const marks = [text.indexOf('?', url.path), text.indexOf('#', url.path)].filter((index) => index !== -1)
    return marks.length > 0 ? text.slice(0, Math.min(...marks)) : text
  }
  return text
}

// One pass over the string, never a backtracking pattern: a header or a path can be 100 KB and is the client's to choose.
function stripUrls(text: string): string {
  if (!text.includes('?') && !text.includes('#')) return text
  if (text.length > LONG_STRING) return cutAtFirstQuery(text)
  let out = ''
  let copied = 0
  let i = 0
  while (i < text.length) {
    const url = urlAt(text, i)
    if (!url) {
      i++
      continue
    }
    let query = url.path
    while (query < text.length && text[query] !== '?' && text[query] !== '#' && !endsUrl(text[query])) query++
    if (query >= text.length || endsUrl(text[query])) {
      i = Math.max(query, i + 1)
      continue
    }
    let end = query
    while (end < text.length && !endsUrl(text[end])) end++
    out += text.slice(copied, query) + text.slice(keptTail(text, url, query, end), end)
    copied = end
    i = end
  }
  return copied === 0 ? text : out + text.slice(copied)
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return stripUrls(value)
  if (typeof value !== 'object' || value === null || depth > MAX_DEPTH) return value
  if (typeof URL !== 'undefined' && value instanceof URL) return stripUrls(value.href)
  if (seen.has(value)) return value
  seen.add(value)
  const record = value as Record<string, unknown>
  let keys: string[]
  try {
    keys = Object.keys(record)
  } catch {
    return value
  }
  for (const key of keys) {
    // Never sent, and it holds live objects: the scope, the client's options, the arguments of logged calls.
    if (key === 'sdkProcessingMetadata') continue
    try {
      if (QUERY_KEYS.has(key.toLowerCase())) {
        delete record[key]
        continue
      }
      const before = record[key]
      const after = walk(before, depth + 1, seen)
      if (after !== before) record[key] = after
    } catch {
      // A frozen object or a throwing getter keeps its value: a throw here would drop the event.
    }
  }
  return value
}

function stripEverywhere<T>(item: T): T {
  try {
    walk(item, 0, new WeakSet())
  } catch {
    // Never throw from a before-send hook, which would drop the event.
  }
  return item
}

// The SDK and Next.js put URLs with their query (`?dpl=`, a page's token) in frames, span attributes and messages.
export function stripQueryStrings<T extends Event>(event: T): T {
  return stripEverywhere(event)
}

export function stripSpanQueryStrings(span: SpanJSON): SpanJSON {
  return stripEverywhere(span)
}
