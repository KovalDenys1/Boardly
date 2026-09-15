import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { getCatalogGames } from '../lib/game-catalog'
import en from '../locales/en'

/**
 * Documentation drift audit – the repo's Markdown is checked against the code
 * it describes, so a doc cannot quietly stop being true.
 *
 * Four checks, all mechanical:
 *   D1  README.md's game lists match lib/game-catalog.ts
 *   D2  every npm script a doc names exists in package.json
 *   D3  every app route a doc names exists under app/ - inline, and in the app URLs
 *       and bare paths of fenced blocks
 *   D4  every environment variable a doc names is declared in .env.example
 *       or scripts/check-env.ts
 *
 * It deliberately checks nothing about style, wording or freshness: those are
 * read by a person at release time (see docs/README.md "Keeping these
 * current"). Known exceptions live in scripts/docs-audit-baseline.json with a
 * reason; an entry that no longer matches anything fails, so the baseline
 * cannot outlive the thing it excused.
 *
 * Regenerate the baseline with: npx tsx scripts/audit-docs.ts --update-baseline
 */

type CheckId = 'D1' | 'D2' | 'D3' | 'D4'

type Violation = {
  file: string
  line: number
  check: CheckId
  value: string
  detail: string
}

type BaselineEntry = {
  file: string
  check: CheckId
  value: string
  reason: string
}

const repoRoot = process.cwd()
const baselinePath = path.join(repoRoot, 'scripts', 'docs-audit-baseline.json')
const updateBaseline = process.argv.includes('--update-baseline')

const checkHints: Record<CheckId, string> = {
  D1: 'README game list disagrees with lib/game-catalog.ts',
  D2: 'npm script named in a doc is not in package.json',
  D3: 'route named in a doc does not exist under app/',
  D4: 'environment variable named in a doc is in neither .env.example nor scripts/check-env.ts',
}

// pnpm's own subcommands, so `pnpm install` is not read as a missing script.
const pnpmBuiltins = new Set([
  'add', 'audit', 'bin', 'config', 'create', 'deploy', 'dlx', 'env', 'exec', 'fetch',
  'i', 'import', 'init', 'install', 'licenses', 'link', 'list', 'll', 'ls', 'outdated',
  'pack', 'patch', 'patch-commit', 'prune', 'publish', 'rebuild', 'remove', 'rm', 'root',
  'run', 'server', 'setup', 'store', 'un', 'uninstall', 'unlink', 'up', 'update', 'why',
])

// ---------------------------------------------------------------------------
// Sources of truth
// ---------------------------------------------------------------------------

function toPosixPath(value: string) {
  return value.split(path.sep).join('/')
}

/** Root-level and docs/ Markdown. docs/superpowers/** is archival by declaration. */
function collectDocFiles(): string[] {
  const files: string[] = []

  for (const entry of readdirSync(repoRoot)) {
    if (entry.endsWith('.md') && statSync(path.join(repoRoot, entry)).isFile()) {
      files.push(entry)
    }
  }

  const docsDir = path.join(repoRoot, 'docs')
  if (existsSync(docsDir)) {
    for (const entry of readdirSync(docsDir)) {
      const absolute = path.join(docsDir, entry)
      if (entry.endsWith('.md') && statSync(absolute).isFile()) {
        files.push(`docs/${entry}`)
      }
    }
  }

  return files.sort()
}

function packageScripts(): Set<string> {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>
  }
  return new Set(Object.keys(pkg.scripts ?? {}))
}

/** Every route that app/ actually serves, as segment arrays. */
function appRoutes(): string[][] {
  const routes: string[][] = []
  const routeFiles = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'route.tsx', 'route.ts'])

  function walk(absoluteDir: string, segments: string[]) {
    for (const entry of readdirSync(absoluteDir)) {
      const absolute = path.join(absoluteDir, entry)
      if (statSync(absolute).isDirectory()) {
        // Route groups `(group)` and parallel slots `@slot` add no URL segment.
        if (entry.startsWith('(') && entry.endsWith(')')) {
          walk(absolute, segments)
        } else if (entry.startsWith('@') || entry.startsWith('_')) {
          continue
        } else {
          walk(absolute, [...segments, entry])
        }
        continue
      }
      if (routeFiles.has(entry)) {
        routes.push(segments)
      }
    }
  }

  walk(path.join(repoRoot, 'app'), [])
  return routes
}

/** Names declared in .env.example, including the commented-out examples. */
function declaredEnvNames(): Set<string> {
  const names = new Set<string>()

  const examplePath = path.join(repoRoot, '.env.example')
  if (existsSync(examplePath)) {
    for (const line of readFileSync(examplePath, 'utf8').split('\n')) {
      const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)
      if (match) {
        names.add(match[1])
      }
    }
  }

  const checkEnvPath = path.join(repoRoot, 'scripts', 'check-env.ts')
  if (existsSync(checkEnvPath)) {
    const source = readFileSync(checkEnvPath, 'utf8')
    for (const match of source.matchAll(/'([A-Z][A-Z0-9_]*)'/g)) {
      names.add(match[1])
    }
  }

  return names
}

/**
 * Every ALL_CAPS token that appears in the TypeScript sources – constants,
 * types and the like. A doc token that is one of these is code, not an
 * environment variable, so D4 leaves it alone.
 */
function sourceIdentifiers(): Set<string> {
  const identifiers = new Set<string>()
  const roots = ['app', 'lib', 'components', 'hooks', 'scripts', 'types', 'locales', 'prisma']
  const extensions = new Set(['.ts', '.tsx'])
  const skipDirectories = new Set(['node_modules', '.next', 'generated'])

  function walk(absoluteDir: string) {
    for (const entry of readdirSync(absoluteDir)) {
      if (skipDirectories.has(entry)) {
        continue
      }
      const absolute = path.join(absoluteDir, entry)
      if (statSync(absolute).isDirectory()) {
        walk(absolute)
        continue
      }
      if (!extensions.has(path.extname(entry))) {
        continue
      }
      const source = readFileSync(absolute, 'utf8')
      for (const match of source.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) {
        identifiers.add(match[0])
      }
    }
  }

  for (const root of roots) {
    const absolute = path.join(repoRoot, root)
    if (existsSync(absolute)) {
      walk(absolute)
    }
  }

  return identifiers
}

// ---------------------------------------------------------------------------
// Markdown scanning
// ---------------------------------------------------------------------------

type CodeSpan = { text: string; line: number }

/** Inline `code` spans, and the lines of fenced blocks, with line numbers. */
function readCodeSpans(source: string): { inline: CodeSpan[]; fencedLines: CodeSpan[] } {
  const inline: CodeSpan[] = []
  const fencedLines: CodeSpan[] = []
  const lines = source.split('\n')
  let inFence = false

  lines.forEach((text, index) => {
    const line = index + 1
    if (/^\s*```/.test(text)) {
      inFence = !inFence
      return
    }
    if (inFence) {
      fencedLines.push({ text, line })
      return
    }
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      inline.push({ text: match[1], line })
    }
  })

  return { inline, fencedLines }
}

function lineNumberOf(source: string, needle: string): number {
  const lines = source.split('\n')
  const index = lines.findIndex((line) => line.includes(needle))
  return index === -1 ? 1 : index + 1
}

// ---------------------------------------------------------------------------
// D1 – README games vs the catalog
// ---------------------------------------------------------------------------

function translate(key: string): string {
  let node: unknown = en as unknown
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) {
      return key
    }
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : key
}

function normalizeGameName(value: string): string {
  return value.trim().toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
}

function checkReadmeGames(file: string, source: string): Violation[] {
  const violations: Violation[] = []

  // The flags decide what a given deployment promotes, not what the catalog
  // says, so the audit reads the static lifecycle state every time.
  delete process.env.ENABLE_TELEPHONE_DOODLE
  delete process.env.NEXT_PUBLIC_ENABLE_TELEPHONE_DOODLE
  delete process.env.ENABLE_SKETCH_AND_GUESS
  delete process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS
  delete process.env.ENABLE_FAKE_ARTIST
  delete process.env.NEXT_PUBLIC_ENABLE_FAKE_ARTIST

  const catalog = getCatalogGames()
  const expected: Record<string, string[]> = {
    available: [],
    'in-development': [],
    planned: [],
  }
  for (const game of catalog) {
    expected[game.availability].push(translate(game.nameKey))
  }

  const headings: Array<{ availability: keyof typeof expected; pattern: RegExp; label: string }> = [
    { availability: 'available', pattern: /^\*\*Available \((\d+)\):\*\*\s*(.+)$/m, label: 'Available' },
    { availability: 'in-development', pattern: /^\*\*In development:\*\*\s*(.+)$/m, label: 'In development' },
    { availability: 'planned', pattern: /^\*\*Planned:\*\*\s*(.+)$/m, label: 'Planned' },
  ]

  for (const heading of headings) {
    const match = heading.pattern.exec(source)
    if (!match) {
      violations.push({
        file,
        line: lineNumberOf(source, '## Games'),
        check: 'D1',
        value: heading.label,
        detail: `no "**${heading.label}:**" line under "## Games" – the audit reads that line to compare against lib/game-catalog.ts`,
      })
      continue
    }

    const line = lineNumberOf(source, match[0])
    const listed = match[match.length - 1].split(',').map((name) => name.trim()).filter(Boolean)
    const listedSet = new Set(listed.map(normalizeGameName))
    const expectedNames = expected[heading.availability]
    const expectedSet = new Set(expectedNames.map(normalizeGameName))

    if (heading.availability === 'available' && Number(match[1]) !== expectedNames.length) {
      violations.push({
        file,
        line,
        check: 'D1',
        value: `Available (${match[1]})`,
        detail: `README says "Available (${match[1]})", lib/game-catalog.ts has ${expectedNames.length}`,
      })
    }

    for (const name of expectedNames) {
      if (!listedSet.has(normalizeGameName(name))) {
        violations.push({
          file,
          line,
          check: 'D1',
          value: name,
          detail: `lib/game-catalog.ts lists "${name}" as ${heading.availability}; the README's "${heading.label}" line does not name it`,
        })
      }
    }

    for (const name of listed) {
      if (!expectedSet.has(normalizeGameName(name))) {
        violations.push({
          file,
          line,
          check: 'D1',
          value: name,
          detail: `README lists "${name}" under "${heading.label}"; lib/game-catalog.ts does not have it as ${heading.availability}`,
        })
      }
    }
  }

  return violations
}

// ---------------------------------------------------------------------------
// D2 – npm scripts
// ---------------------------------------------------------------------------

function checkScripts(file: string, spans: CodeSpan[], scripts: Set<string>): Violation[] {
  const violations: Violation[] = []
  const seen = new Set<string>()

  for (const span of spans) {
    const candidates: string[] = []
    for (const match of span.text.matchAll(/\b(?:npm|pnpm|yarn)\s+run\s+([a-z][a-z0-9:_-]*)/g)) {
      candidates.push(match[1])
    }
    for (const match of span.text.matchAll(/\bpnpm\s+([a-z][a-z0-9:_-]*)/g)) {
      if (!pnpmBuiltins.has(match[1])) {
        candidates.push(match[1])
      }
    }

    for (const name of candidates) {
      if (scripts.has(name) || seen.has(`${name}:${span.line}`)) {
        continue
      }
      seen.add(`${name}:${span.line}`)
      violations.push({
        file,
        line: span.line,
        check: 'D2',
        value: name,
        detail: `package.json has no "${name}" script`,
      })
    }
  }

  return violations
}

// ---------------------------------------------------------------------------
// D3 – routes
// ---------------------------------------------------------------------------

/** A doc may write a dynamic segment as [code], <code> or :code. */
function isPlaceholderSegment(segment: string) {
  return (
    (segment.startsWith('[') && segment.endsWith(']')) ||
    (segment.startsWith('<') && segment.endsWith('>')) ||
    segment.startsWith(':')
  )
}

function routeExists(candidate: string, routes: string[][]): boolean {
  const segments = candidate.split('/').filter(Boolean)

  return routes.some((route) => {
    let routeIndex = 0
    for (let i = 0; i < segments.length; i++) {
      const routeSegment = route[routeIndex]
      if (routeSegment === undefined) {
        return false
      }
      if (routeSegment.startsWith('[...') || routeSegment.startsWith('[[...')) {
        return true
      }
      const routeIsDynamic = routeSegment.startsWith('[') && routeSegment.endsWith(']')
      if (!routeIsDynamic && !isPlaceholderSegment(segments[i]) && routeSegment !== segments[i]) {
        return false
      }
      routeIndex++
    }
    return routeIndex === route.length
  })
}

/**
 * Route-shaped tokens inside a fenced block: an app URL in a curl/fetch example, or a
 * bare path on a line of its own. A fenced line is a whole command, so unlike an inline
 * span it cannot be treated as one candidate.
 */
function fencedRouteCandidates(spans: CodeSpan[]): CodeSpan[] {
  const candidates: CodeSpan[] = []

  for (const span of spans) {
    const appUrl = /https?:\/\/(?:localhost:\d+|(?:www\.)?boardly\.online)(\/[A-Za-z0-9[\]<>:_./-]*)/g
    for (const match of span.text.matchAll(appUrl)) {
      candidates.push({ text: match[1], line: span.line })
    }
    const bare = span.text.trim()
    if (/^\/[A-Za-z0-9[\]<>:_.-]+(?:\/[A-Za-z0-9[\]<>:_.-]+)*$/.test(bare)) {
      candidates.push({ text: bare, line: span.line })
    }
  }

  return candidates
}

function checkRoutes(file: string, spans: CodeSpan[], routes: string[][]): Violation[] {
  const violations: Violation[] = []
  const seen = new Set<string>()

  for (const span of spans) {
    const candidate = span.text.trim().replace(/\/$/, '')
    if (!/^\/[A-Za-z0-9[\]<>:_.-]+(?:\/[A-Za-z0-9[\]<>:_.-]+)*$/.test(candidate)) {
      continue
    }
    // A path with a file extension is a file, not a route.
    if (/\.[A-Za-z0-9]{1,5}$/.test(candidate)) {
      continue
    }
    if (routeExists(candidate, routes) || seen.has(`${candidate}:${span.line}`)) {
      continue
    }
    seen.add(`${candidate}:${span.line}`)
    violations.push({
      file,
      line: span.line,
      check: 'D3',
      value: candidate,
      detail: `no page.tsx or route.ts under app/ serves "${candidate}"`,
    })
  }

  return violations
}

// ---------------------------------------------------------------------------
// D4 – environment variables
// ---------------------------------------------------------------------------

function checkEnvVars(
  file: string,
  inline: CodeSpan[],
  fencedLines: CodeSpan[],
  declared: Set<string>,
  identifiers: Set<string>
): Violation[] {
  const violations: Violation[] = []
  const seen = new Set<string>()
  const candidates: CodeSpan[] = []

  for (const span of inline) {
    const token = span.text.trim()
    if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(token)) {
      candidates.push({ text: token, line: span.line })
    }
  }

  // Assignment lines inside fenced blocks: `FOO_BAR=...`, `$env:FOO_BAR='...'`.
  for (const span of fencedLines) {
    const match = /(?:^|\s|\$env:)#?\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*=/.exec(span.text)
    if (match) {
      candidates.push({ text: match[1], line: span.line })
    }
  }

  for (const candidate of candidates) {
    const name = candidate.text
    if (declared.has(name) || seen.has(`${name}:${candidate.line}`)) {
      continue
    }
    // Not declared anywhere and not an env var the code reads: it is a code
    // constant being quoted, so D4 has nothing to say about it.
    if (!name.startsWith('NEXT_PUBLIC_') && identifiers.has(name) && !envReadByCode.has(name)) {
      continue
    }
    seen.add(`${name}:${candidate.line}`)
    violations.push({
      file,
      line: candidate.line,
      check: 'D4',
      value: name,
      detail: envReadByCode.has(name)
        ? `"${name}" is read by the code but declared in neither .env.example nor scripts/check-env.ts`
        : `"${name}" is in neither .env.example nor scripts/check-env.ts, and nothing reads it`,
    })
  }

  return violations
}

/** Every process.env name the sources read. */
function readEnvNamesFromCode(): Set<string> {
  const names = new Set<string>()
  const roots = ['app', 'lib', 'components', 'hooks', 'scripts', 'prisma', 'e2e']
  const extensions = new Set(['.ts', '.tsx', '.mjs', '.js'])
  const skipDirectories = new Set(['node_modules', '.next', 'generated'])

  function walk(absoluteDir: string) {
    for (const entry of readdirSync(absoluteDir)) {
      if (skipDirectories.has(entry)) {
        continue
      }
      const absolute = path.join(absoluteDir, entry)
      if (statSync(absolute).isDirectory()) {
        walk(absolute)
        continue
      }
      if (!extensions.has(path.extname(entry))) {
        continue
      }
      const source = readFileSync(absolute, 'utf8')
      for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        names.add(match[1])
      }
      for (const match of source.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) {
        names.add(match[1])
      }
    }
  }

  for (const root of roots) {
    const absolute = path.join(repoRoot, root)
    if (existsSync(absolute)) {
      walk(absolute)
    }
  }

  const envLib = path.join(repoRoot, 'lib', 'env.ts')
  if (existsSync(envLib)) {
    for (const match of readFileSync(envLib, 'utf8').matchAll(/^\s{2}([A-Z][A-Z0-9_]*):\s*z\./gm)) {
      names.add(match[1])
    }
  }

  return names
}

const envReadByCode = readEnvNamesFromCode()

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function loadBaseline(): BaselineEntry[] {
  if (!existsSync(baselinePath)) {
    return []
  }
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineEntry[]
}

const scripts = packageScripts()
const routes = appRoutes()
const declared = declaredEnvNames()
const identifiers = sourceIdentifiers()

const violations: Violation[] = []

for (const file of collectDocFiles()) {
  const source = readFileSync(path.join(repoRoot, file), 'utf8')
  const { inline, fencedLines } = readCodeSpans(source)

  if (file === 'README.md') {
    violations.push(...checkReadmeGames(file, source))
  }
  violations.push(...checkScripts(file, [...inline, ...fencedLines], scripts))
  violations.push(...checkRoutes(file, [...inline, ...fencedRouteCandidates(fencedLines)], routes))
  violations.push(...checkEnvVars(file, inline, fencedLines, declared, identifiers))
}

if (updateBaseline) {
  const existing = new Map(loadBaseline().map((entry) => [`${entry.file} ${entry.check} ${entry.value}`, entry.reason]))
  const entries: BaselineEntry[] = []
  const seen = new Set<string>()

  for (const violation of violations) {
    const key = `${violation.file} ${violation.check} ${violation.value}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    entries.push({
      file: violation.file,
      check: violation.check,
      value: violation.value,
      reason: existing.get(key) ?? 'TODO: say why this is not drift',
    })
  }

  entries.sort((a, b) => a.file.localeCompare(b.file) || a.check.localeCompare(b.check) || a.value.localeCompare(b.value))
  writeFileSync(baselinePath, `${JSON.stringify(entries, null, 2)}\n`)
  console.log(`Docs audit baseline updated: ${entries.length} entries.`)
  process.exit(0)
}

const baseline = loadBaseline()
const baselineKeys = new Set(baseline.map((entry) => `${entry.file} ${entry.check} ${entry.value}`))
const matchedBaselineKeys = new Set<string>()

const newViolations = violations.filter((violation) => {
  const key = `${violation.file} ${violation.check} ${violation.value}`
  if (baselineKeys.has(key)) {
    matchedBaselineKeys.add(key)
    return false
  }
  return true
})

const staleBaselineEntries = baseline.filter(
  (entry) => !matchedBaselineKeys.has(`${entry.file} ${entry.check} ${entry.value}`)
)

if (newViolations.length > 0 || staleBaselineEntries.length > 0) {
  console.error('Documentation audit failed:')
  for (const violation of newViolations) {
    console.error(`- ${violation.file}:${violation.line}: ${violation.detail} (${violation.check} – ${checkHints[violation.check]})`)
  }
  for (const entry of staleBaselineEntries) {
    console.error(
      `- stale baseline entry: ${entry.file} ${entry.check} "${entry.value}" no longer matches anything – drop it from scripts/docs-audit-baseline.json`
    )
  }
  process.exit(1)
}

console.log(
  `Documentation audit passed (${collectDocFiles().length} docs, ${baseline.length} baselined exceptions).`
)
