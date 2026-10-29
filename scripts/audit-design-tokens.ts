import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { LEGACY_CLASS, accentTextLines, colourUtilities, focusColourLines, tokenHexShadowLines, tokenHexValues, varShorthandLines } from './design-token-rules'

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
 *
 * It also fails on an accent fill or shade used as a text colour (#1457), with no baseline: text
 * takes --bd-<accent>-text. An `accent-text-allow` comment on the line or the one above exempts it.
 * And on a focus ring or outline in any colour but --bd-lav-deep, the one focus colour, and on a
 * colour spelled `-(--bd-x)` or `-[var(--bd-x)]` where the `bd-x` utility exists, and on a shadow
 * that hard-codes a token's hex (app/root-document.tsx's critical CSS excepted).
 */

const repoRoot = process.cwd()
const scanRoots = ['app', 'components']
const extensions = new Set(['.ts', '.tsx', '.css'])
const ignored = new Set(['node_modules', '.next', '.git', 'coverage'])
const baselinePath = path.join(repoRoot, 'scripts', 'design-tokens-baseline.json')
const updateBaseline = process.argv.includes('--update-baseline')

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
const accentText: string[] = []
const focusColour: string[] = []
const varShorthand: string[] = []
const globalsCss = readFileSync(path.join(repoRoot, 'app', 'globals.css'), 'utf8')
const utilities = colourUtilities(globalsCss)
const tokenHex = tokenHexValues(globalsCss)
const hexShadow: string[] = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = path.relative(repoRoot, file).split(path.sep).join('/')
  const n = (src.match(LEGACY_CLASS) ?? []).length
  if (n > 0) counts[rel] = n
  if (file.endsWith('.css')) continue
  for (const line of accentTextLines(src)) accentText.push(`${rel}:${line}`)
  for (const line of focusColourLines(src)) focusColour.push(`${rel}:${line}`)
  for (const line of varShorthandLines(src, utilities)) varShorthand.push(`${rel}:${line}`)
  if (rel !== 'app/root-document.tsx') for (const line of tokenHexShadowLines(src, tokenHex)) hexShadow.push(`${rel}:${line}`)
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

for (const at of accentText) problems.push(`${at}: an accent fill or shade as text – use --bd-<accent>-text (DESIGN.md)`)
for (const at of focusColour) problems.push(`${at}: a focus ring in another colour – use bd-lav-deep (DESIGN.md)`)
for (const at of varShorthand) problems.push(`${at}: a colour spelled through its variable – use the bd-* utility`)
for (const at of hexShadow) problems.push(`${at}: a shadow with a token's hex – use var(--bd-*) so it follows dark mode`)

if (problems.length > 0) {
  console.error('design-tokens audit FAILED:\n  ' + problems.join('\n  '))
  process.exit(1)
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)
console.log(`design-tokens audit ok – ${total} legacy class(es) in ${Object.keys(counts).length} file(s), all in baseline`)
