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
}

if (problems.length > 0) {
  console.error(
    'focus-rings audit FAILED – these paint outside the box and a scrolling ancestor clips them:\n  ' +
      problems.join('\n  '),
  )
  process.exit(1)
}
console.log(`focus-rings audit ok – ${files.length} file(s), no outer ring or positive outline-offset`)
