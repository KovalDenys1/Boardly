import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'

/**
 * Design-token audit – the pre-Boardly palette must not come back (#1254).
 *
 * The site moved to the bd-* tokens in May (#293), page by page, through tickets. Nothing
 * checked the result, and the June theme audit only asked whether pages worked in dark mode,
 * so it passed pages still wearing Tailwind's default slate/gray/blue look – /auth/forgot-password
 * among them, found by Denys on 2026-09-28. This fails on those classes.
 *
 * Legacy debt lives in scripts/design-tokens-baseline.json as a ratchet, like the responsive
 * audit: a file over its baseline count fails (no new debt), and a file under it fails too, so
 * the baseline shrinks in the same change that migrates the file.
 * Regenerate after a migration with: npx tsx scripts/audit-design-tokens.ts --update-baseline
 */

const repoRoot = process.cwd()
const scanRoots = ['app', 'components']
const extensions = new Set(['.ts', '.tsx', '.css'])
const ignored = new Set(['node_modules', '.next', '.git', 'coverage'])
const baselinePath = path.join(repoRoot, 'scripts', 'design-tokens-baseline.json')
const updateBaseline = process.argv.includes('--update-baseline')

// Tailwind's default neutrals and blues, with any variant prefix (dark:, hover:, md:...).
// `bd-sky`, `bd-lav` and the other tokens never match: the colour must follow a utility and be
// followed by a shade number.
const LEGACY_CLASS =
  /(?<![\w-])(?:[a-z0-9]+:)*(?:bg|text|border|from|to|via|ring|outline|divide|placeholder|shadow|fill|stroke|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|blue|indigo)-\d{2,3}(?:\/\d{1,3})?(?![\w-])/g

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

const counts: Record<string, number> = {}
for (const file of files) {
  const n = (readFileSync(file, 'utf8').match(LEGACY_CLASS) ?? []).length
  if (n > 0) counts[path.relative(repoRoot, file).split(path.sep).join('/')] = n
}

if (updateBaseline) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n')
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log(`design-tokens baseline written: ${total} legacy class(es) in ${Object.keys(counts).length} file(s)`)
  process.exit(0)
}

const baseline: Record<string, number> = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : {}
const problems: string[] = []
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0
  if (n > allowed) problems.push(`${file}: ${n} legacy palette class(es), baseline ${allowed} – use the bd-* tokens (DESIGN.md)`)
}
for (const [file, allowed] of Object.entries(baseline)) {
  const n = counts[file] ?? 0
  if (n < allowed) problems.push(`${file}: baseline ${allowed} but only ${n} left – shrink it with --update-baseline`)
}

if (problems.length > 0) {
  console.error('design-tokens audit FAILED:\n  ' + problems.join('\n  '))
  process.exit(1)
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)
console.log(`design-tokens audit ok – ${total} legacy class(es) in ${Object.keys(counts).length} file(s), all in baseline`)
