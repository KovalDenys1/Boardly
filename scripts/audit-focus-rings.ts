import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

/**
 * Focus-ring audit – nothing paints outside the box (#1278).
 *
 * An outline with a positive `outline-offset`, or a Tailwind ring pushed out by `ring-offset-N`,
 * is drawn outside the element's border box. Any ancestor whose overflow is not visible clips it,
 * and `overflow-y: auto` clips the x axis too, so a focused or selected item in a scrolling list
 * loses part of its ring. Draw it inside instead: `ring-inset`, or a negative `outline-offset`
 * equal to the outline width (`-outline-offset-2`, `outline-offset: -3px`).
 *
 * Fails on:
 *   F1 – `outline-offset: <positive>` in CSS
 *   F2 – a `ring-offset-<N>` or `ring-offset-[…]` width class (colour-only `ring-offset-bd-*` is inert)
 *   F3 – a positive `outline-offset-<N>` / `outline-offset-[…]` class (`-outline-offset-2` is fine)
 *   F4 – a ring width (`ring`, `ring-2`, `ring-[3px]`) with no `ring-inset` in the same class
 *        string (or the template literal around it). A plain ring is a 0-offset box-shadow
 *        spread outward, so it is clipped exactly like an offset one. Where a child covers the
 *        element's box (an <img>, a full-bleed layer) an inset ring is hidden under it: use an
 *        outline with a negative offset there instead.
 * There is no baseline: the tree was cleaned in the same change, so any hit is new.
 */

const repoRoot = process.cwd()
const scanRoots = ['app', 'components']
const extensions = new Set(['.ts', '.tsx', '.css'])
const ignored = new Set(['node_modules', '.next', '.git', 'coverage'])

const CSS_OUTLINE_OFFSET = /outline-offset\s*:\s*([+-]?\d*\.?\d+[a-z%]*)/g
// Tailwind classes, with any variant prefix (focus-visible:, md:, dark:...). The lookbehind
// keeps `-outline-offset-2` (negative, allowed) from matching as `outline-offset-2`.
const RING_OFFSET_CLASS = /(?<![\w-])(?:[\w-]+:)*ring-offset-(?:\d*[1-9]|\[)[^\s'"`]*/g
const OUTLINE_OFFSET_CLASS = /(?<![\w-])(?:[\w-]+:)*outline-offset-(?:\d*[1-9]|\[(?!-))[^\s'"`]*/g

// A ring width: `ring` (3px), `ring-2`, `ring-[3px]`. `ring-0` draws nothing; colours
// (`ring-bd-lav`, `ring-[#FFC44D]`, `ring-[var(--x)]`) and `ring-inset` carry no width.
const RING_WIDTH_TOKEN = /^!?ring(?:-[1-9]\d*|-\[\d*\.?\d+(?:px|rem|em)\])?$/
const RING_INSET_TOKEN = /^!?ring-inset$/

type Literal = { text: string; offset: number; parent: number }

/**
 * Every string literal in a TS/TSX source, with template literals holding only their static
 * text and pointing at their enclosing template (`parent`), so a nested
 * `${held ? 'ring-4' : ''}` counts as the same element as the template around it. Comments
 * are skipped. A quote only opens a string after an operator or bracket, so an apostrophe in
 * JSX text ("Don't") is not read as one.
 */
function stringLiterals(src: string): Literal[] {
  const out: Literal[] = []
  // Stack of open templates: index into `out`, and the brace depth of their ${…} expression.
  const templates: { index: number; depth: number }[] = []
  let depth = 0
  let i = 0
  let lastSignificant = ''
  const openTemplate = (at: number) => {
    out.push({ text: '', offset: at, parent: templates.length ? templates[templates.length - 1].index : -1 })
    templates.push({ index: out.length - 1, depth: -1 })
  }
  // Reads template text from i until `${` or the closing backtick.
  const readTemplateText = () => {
    const t = templates[templates.length - 1]
    while (i < src.length) {
      const c = src[i]
      if (c === '\\') { out[t.index].text += src.slice(i, i + 2); i += 2; continue }
      if (c === '`') { templates.pop(); i++; lastSignificant = '`'; return }
      if (c === '$' && src[i + 1] === '{') { depth++; t.depth = depth; i += 2; lastSignificant = '{'; return }
      out[t.index].text += c
      i++
    }
  }
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue }
    if (c === '/' && next === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
    if (c === '`') { openTemplate(i); i++; readTemplateText(); continue }
    if ((c === "'" || c === '"') && (lastSignificant === '' || '=([{,:?+&|!;>}'.includes(lastSignificant))) {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out.push({ text: src.slice(i + 1, j), offset: i, parent: templates.length ? templates[templates.length - 1].index : -1 })
      i = j + 1
      lastSignificant = c
      continue
    }
    if (c === '{') depth++
    if (c === '}') {
      const t = templates[templates.length - 1]
      if (t && t.depth === depth) { depth--; i++; t.depth = -1; readTemplateText(); continue }
      depth--
    }
    if (!/\s/.test(c)) lastSignificant = c
    i++
  }
  return out
}

/** Ring widths in a literal with no `ring-inset` in it or in any template around it. */
function outerRings(src: string): { token: string; offset: number }[] {
  const literals = stringLiterals(src)
  const tokens = literals.map((l) => l.text.split(/\s+/).map((t) => t.replace(/^(?:[\w\-[\]&>*.@/]+:)+/, '')))
  const hasInset = (index: number): boolean =>
    index >= 0 && (tokens[index].some((t) => RING_INSET_TOKEN.test(t)) || hasInset(literals[index].parent))
  const found: { token: string; offset: number }[] = []
  literals.forEach((l, index) => {
    if (hasInset(index)) return
    // Prose, not a class list ("…, gilded ring"): a capitalised word or trailing punctuation.
    if (tokens[index].some((t) => /^[A-Z]|[,.;]$/.test(t))) return
    for (const raw of l.text.split(/\s+/)) {
      const bare = raw.replace(/^(?:[\w\-[\]&>*.@/]+:)+/, '')
      if (RING_WIDTH_TOKEN.test(bare)) found.push({ token: raw, offset: l.offset })
    }
  })
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
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const where = `${rel}:${i + 1}`
    if (isCss) {
      for (const m of line.matchAll(CSS_OUTLINE_OFFSET)) {
        if (parseFloat(m[1]) > 0) problems.push(`${where} F1 ${m[0].trim()} – use a negative offset equal to the outline width`)
      }
    }
    for (const m of line.matchAll(RING_OFFSET_CLASS)) {
      problems.push(`${where} F2 ${m[0]} – use ring-inset`)
    }
    for (const m of line.matchAll(OUTLINE_OFFSET_CLASS)) {
      problems.push(`${where} F3 ${m[0]} – use a negative offset (-outline-offset-N)`)
    }
  })
  if (!isCss) {
    const src = readFileSync(file, 'utf8')
    for (const { token, offset } of outerRings(src)) {
      const line = src.slice(0, offset).split('\n').length
      problems.push(`${rel}:${line} F4 ${token} – add ring-inset, or an inset outline where a child covers the box`)
    }
  }
}

if (problems.length > 0) {
  console.error(
    'focus-rings audit FAILED – these paint outside the box and a scrolling ancestor clips them:\n  ' +
      problems.join('\n  '),
  )
  process.exit(1)
}
console.log(`focus-rings audit ok – ${files.length} file(s), no outer ring or positive outline-offset`)
