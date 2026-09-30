import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

/**
 * Focus-ring audit – rings and outlines are drawn inside the box (#1278).
 *
 * Anything painted outside an element's border box is clipped by the nearest ancestor whose
 * overflow is not visible, and `overflow-y: auto` makes overflow-x clip as well, so a focused
 * or selected item in a scrolling list loses part of its ring. Draw it inside instead:
 * `ring-inset`, an `inset` box-shadow, or an outline with a negative `outline-offset` equal to
 * its width (`outline-2 -outline-offset-2`, `outline: 3px …; outline-offset: -3px`).
 *
 * Fails on (comments are ignored):
 *   F1 – `outline-offset: <positive>` in CSS
 *   F2 – a `ring-offset-<N>` or `ring-offset-[…]` width class (colour-only `ring-offset-bd-*` is inert)
 *   F3 – a positive `outline-offset-<N>` / `outline-offset-[…]` class
 *   F4 – a ring width (`ring`, `ring-2`, `ring-[3px]`) with no `ring-inset` on the same element:
 *        the same class string, the template literal around it, the other strings of the same
 *        `cn(…)` / `clsx(…)` / `[…].join(' ')`, or the same CSS `@apply`. A plain ring is a
 *        box-shadow spread outward, so it is clipped exactly like an offset one.
 *   F5 – an outer spread-ring shadow: a `box-shadow` layer `0 0 0 <N>` (N > 0) without `inset` in CSS or
 *        an inline style string, or a `shadow-[0_0_0_…]` class without `inset_`.
 *
 * Where a child covers the element (an <img>, a full-bleed layer) an inset ring or inset shadow is
 * hidden under it: use an outline with a negative offset there.
 *
 * What it does not see: an outline at the default offset 0 (it still paints outside the box, and
 * nothing here knows whether an outline is set), drop shadows and blurred glows, rings built in
 * JavaScript from variables, and class strings assembled by helpers other than the ones above.
 *
 * Escape hatch, for an effect meant to reach past the element (a pulse, a spotlight): a CSS
 * comment containing `focus-rings-allow` exempts the next rule or at-rule block; in a script,
 * the comment goes on the finding's line or the line above. Say why in the comment.
 * There is no baseline; the tree was clean when this was written.
 */

const repoRoot = process.cwd()
const scanRoots = ['app', 'components']
const extensions = new Set(['.ts', '.tsx', '.css'])
const ignored = new Set(['node_modules', '.next', '.git', 'coverage'])

const CSS_OUTLINE_OFFSET = /outline-offset\s*:\s*([+-]?\d*\.?\d+[a-z%]*)/g
// Tailwind classes, with any variant prefix (focus-visible:, md:, dark:...). The lookbehind
// keeps `-outline-offset-2` (negative, allowed) from matching as `outline-offset-2`.
const RING_OFFSET_CLASS = /(?<![\w-])(?:[\w-]+:)*ring-offset-(?:\d*[1-9]|\[)[^\s'"`;]*/g
const OUTLINE_OFFSET_CLASS = /(?<![\w-])(?:[\w-]+:)*outline-offset-(?:\d*[1-9]|\[(?!-))[^\s'"`;]*/g

// A ring width: `ring` (3px), `ring-2`, `ring-[3px]`. `ring-0` draws nothing; colours
// (`ring-bd-lav`, `ring-[#FFC44D]`, `ring-[var(--x)]`) and `ring-inset` carry no width.
const RING_WIDTH_TOKEN = /^!?ring(?:-[1-9]\d*|-\[\d*\.?\d+(?:px|rem|em)\])?$/
const RING_INSET_TOKEN = /^!?ring-inset$/
const SHADOW_CLASS_TOKEN = /^!?shadow-\[(.*)\]$/
const VARIANTS = /^(?:[\w\-[\]&>*.@/]+:)+/
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classNames', 'twMerge', 'cx'])

const bare = (token: string) => token.replace(VARIANTS, '')

/** True when a box-shadow value has a `0 0 0 <N>` layer that is not inset. */
function hasOuterSpreadLayer(value: string): boolean {
  // Split on top-level commas only, so rgba(…) and var(…, …) stay in one layer.
  const layers: string[] = ['']
  let parens = 0
  for (const ch of value) {
    if (ch === '(') parens++
    if (ch === ')') parens--
    if (ch === ',' && parens === 0) layers.push('')
    else layers[layers.length - 1] += ch
  }
  return layers.some((layer) => /^\s*0 0 0 (?:0*[1-9]|0*\.\d*[1-9])/.test(layer) && !/\binset\b/.test(layer))
}

/** Replaces every comment with spaces, keeping line numbers and columns. */
function blankComments(src: string, isCss: boolean): string {
  const out = src.split('')
  let i = 0
  let quote = ''
  let last = ''
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (quote) {
      if (c === '\\') { i += 2; continue }
      if (c === quote || (c === '\n' && quote !== '`')) quote = ''
      i++
      continue
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      for (let k = i; k < stop; k++) if (out[k] !== '\n') out[k] = ' '
      i = stop
      continue
    }
    if (!isCss && c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') out[i++] = ' '
      continue
    }
    if (c === '`' || ((c === "'" || c === '"') && (isCss || last === '' || '=([{,:?+&|!;>}'.includes(last)))) {
      quote = c
      i++
      continue
    }
    if (!/\s/.test(c)) last = c
    i++
  }
  return out.join('')
}

type Literal = { text: string; offset: number; parent: number; group: number }

/**
 * Every string literal in a comment-free TS/TSX source. A template literal holds only its static
 * text and is the `parent` of the strings inside its ${…}, so `${held ? 'ring-4' : ''}` counts as
 * the same element as the template around it. Strings passed to one `cn(…)`-style call or listed
 * in one `[…].join(…)` share a `group`. A quote only opens a string after an operator or bracket,
 * so an apostrophe in JSX text ("Don't") is not read as one.
 */
function stringLiterals(src: string): Literal[] {
  const out: Literal[] = []
  const templates: { index: number; depth: number }[] = []
  const brackets: { kind: '(' | '['; start: number; helper: boolean }[] = []
  let groups = 0
  let depth = 0
  let i = 0
  let last = ''
  const parentIndex = () => (templates.length ? templates[templates.length - 1].index : -1)
  const readTemplateText = () => {
    const t = templates[templates.length - 1]
    while (i < src.length) {
      const c = src[i]
      if (c === '\\') { out[t.index].text += src.slice(i, i + 2); i += 2; continue }
      if (c === '`') { templates.pop(); i++; last = '`'; return }
      if (c === '$' && src[i + 1] === '{') { depth++; t.depth = depth; i += 2; last = '{'; return }
      out[t.index].text += c
      i++
    }
  }
  while (i < src.length) {
    const c = src[i]
    if (c === '`') {
      out.push({ text: '', offset: i, parent: parentIndex(), group: -1 })
      templates.push({ index: out.length - 1, depth: -1 })
      i++
      readTemplateText()
      continue
    }
    if ((c === "'" || c === '"') && (last === '' || '=([{,:?+&|!;>}'.includes(last))) {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out.push({ text: src.slice(i + 1, j), offset: i, parent: parentIndex(), group: -1 })
      i = j + 1
      last = c
      continue
    }
    if (c === '(' || c === '[') {
      const word = /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(Math.max(0, i - 40), i))
      brackets.push({ kind: c, start: out.length, helper: c === '(' && !!word && CLASS_HELPERS.has(word[1]) })
    }
    if ((c === ')' || c === ']') && brackets.length) {
      const b = brackets.pop()!
      const joined = b.kind === '[' && /^\s*\.join\s*\(/.test(src.slice(i + 1, i + 40))
      if (b.helper || joined) {
        const id = groups++
        for (let k = b.start; k < out.length; k++) if (out[k].group < 0) out[k].group = id
      }
    }
    if (c === '{') depth++
    if (c === '}') {
      const t = templates[templates.length - 1]
      if (t && t.depth === depth) { depth--; i++; t.depth = -1; readTemplateText(); continue }
      depth--
    }
    if (!/\s/.test(c)) last = c
    i++
  }
  return out
}

type Finding = { rule: string; token: string; offset: number; hint: string }

const F4_HINT = 'add ring-inset, or an inset outline where a child covers the box'
const F5_HINT = 'make it an inset shadow, or an inset outline where a child covers the box'

function scanScript(src: string): Finding[] {
  const literals = stringLiterals(src)
  const tokens = literals.map((l) => l.text.split(/\s+/).filter(Boolean))
  const ownInset = (k: number) => tokens[k].some((t) => RING_INSET_TOKEN.test(bare(t)))
  const hasInset = (k: number): boolean => {
    if (k < 0) return false
    if (ownInset(k)) return true
    const g = literals[k].group
    if (g >= 0 && literals.some((l, m) => l.group === g && ownInset(m))) return true
    return hasInset(literals[k].parent)
  }
  const found: Finding[] = []
  literals.forEach((l, k) => {
    // An inline style value: `boxShadow: '0 0 0 2px var(--bd-ink)'`.
    if (hasOuterSpreadLayer(l.text)) found.push({ rule: 'F5', token: l.text.trim(), offset: l.offset, hint: F5_HINT })
    // Prose, not a class list ("…, gilded ring"): a capitalised word or trailing punctuation.
    if (tokens[k].some((t) => /^[A-Z]|[,.;]$/.test(t))) return
    const inset = hasInset(k)
    for (const raw of tokens[k]) {
      const b = bare(raw)
      if (!inset && RING_WIDTH_TOKEN.test(b)) found.push({ rule: 'F4', token: raw, offset: l.offset, hint: F4_HINT })
      const shadow = SHADOW_CLASS_TOKEN.exec(b)
      if (shadow && hasOuterSpreadLayer(shadow[1].replace(/_/g, ' '))) {
        found.push({ rule: 'F5', token: raw, offset: l.offset, hint: F5_HINT })
      }
    }
  })
  return found
}

function scanCss(src: string): Finding[] {
  const found: Finding[] = []
  // Blocks exempted by a `focus-rings-allow` comment, as [start, end) offsets.
  const allowed: [number, number][] = []
  for (const m of src.matchAll(/\/\*(?:(?!\*\/)[^])*?focus-rings-allow(?:(?!\*\/)[^])*?\*\//g)) {
    const open = src.indexOf('{', m.index! + m[0].length)
    if (open < 0) continue
    let d = 0
    let k = open
    for (; k < src.length; k++) {
      if (src[k] === '{') d++
      else if (src[k] === '}' && --d === 0) break
    }
    allowed.push([m.index!, k + 1])
  }
  const isAllowed = (at: number) => allowed.some(([a, b]) => at >= a && at < b)
  const clean = blankComments(src, true)
  for (const m of clean.matchAll(/box-shadow\s*:\s*([^;}]*)/g)) {
    if (!isAllowed(m.index!) && hasOuterSpreadLayer(m[1])) {
      found.push({ rule: 'F5', token: m[0].trim(), offset: m.index!, hint: F5_HINT })
    }
  }
  for (const m of clean.matchAll(/@apply\s+([^;}]*)/g)) {
    const classes = m[1].split(/\s+/).filter(Boolean)
    if (classes.some((t) => RING_INSET_TOKEN.test(bare(t)))) continue
    for (const t of classes) {
      if (RING_WIDTH_TOKEN.test(bare(t))) found.push({ rule: 'F4', token: t, offset: m.index!, hint: F4_HINT })
    }
  }
  return found
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (extensions.has(path.extname(name))) out.push(full)
  }
}

const files: string[] = []
for (const root of scanRoots) if (existsSync(path.join(repoRoot, root))) walk(path.join(repoRoot, root), files)

const problems: string[] = []
for (const file of files) {
  const rel = path.relative(repoRoot, file).split(path.sep).join('/')
  const isCss = file.endsWith('.css')
  const src = readFileSync(file, 'utf8')
  const clean = blankComments(src, isCss)
  clean.split('\n').forEach((line, i) => {
    const where = `${rel}:${i + 1}`
    if (isCss) {
      for (const m of line.matchAll(CSS_OUTLINE_OFFSET)) {
        if (parseFloat(m[1]) > 0) problems.push(`${where} F1 ${m[0].trim()} – use a negative offset equal to the outline width`)
      }
    }
    for (const m of line.matchAll(RING_OFFSET_CLASS)) problems.push(`${where} F2 ${m[0]} – use ring-inset`)
    for (const m of line.matchAll(OUTLINE_OFFSET_CLASS)) {
      problems.push(`${where} F3 ${m[0]} – use a negative offset (-outline-offset-N)`)
    }
  })
  const lines = src.split('\n')
  for (const f of isCss ? scanCss(src) : scanScript(clean)) {
    const line = src.slice(0, f.offset).split('\n').length
    // Script escape hatch: `focus-rings-allow` in a comment on this line or the one above.
    if (!isCss && /focus-rings-allow/.test(`${lines[line - 2] ?? ''}\n${lines[line - 1]}`)) continue
    problems.push(`${rel}:${line} ${f.rule} ${f.token} – ${f.hint}`)
  }
}

if (problems.length > 0) {
  console.error(
    'focus-rings audit FAILED – these paint outside the box and a scrolling ancestor clips them:\n  ' +
      problems.join('\n  '),
  )
  process.exit(1)
}
console.log(`focus-rings audit ok – ${files.length} file(s), no outer ring, spread shadow or positive outline-offset`)
