import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { DESKTOP_MIN_WIDTH_PX, HEADER_HEIGHT_PX } from '../lib/responsive-tokens'

/**
 * Responsive layout audit — enforces the Responsive UI Definition of Done
 * (see CLAUDE.md "Responsive UI — Definition of Done" and docs/RESPONSIVE.md).
 *
 * Legacy debt is tracked in scripts/responsive-audit-baseline.json as a ratchet:
 * - a violation NOT covered by the baseline fails the audit (no new debt)
 * - a baseline entry whose count exceeds reality fails the audit (stale entries
 *   must be shrunk in the same PR that removes the violations)
 * Regenerate after a migration PR with: npx tsx scripts/audit-responsive.ts --update-baseline
 *
 * Per-line opt-out (legit exceptions only, never for new layout code): add a
 * comment containing `responsive-audit-allow(R2): reason` (any comment syntax)
 * on the offending line or the line directly above it.
 */

type CheckId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7'

type Violation = {
  file: string
  line: number
  check: CheckId
  match: string
}

type BaselineEntry = {
  file: string
  check: CheckId
  count: number
}

const repoRoot = process.cwd()
const scanRoots = ['app', 'components', 'hooks']
const sourceExtensions = new Set(['.ts', '.tsx', '.css'])
const ignoredDirectories = new Set(['node_modules', '.next', '.git', 'coverage', 'reports'])
const baselinePath = path.join(repoRoot, 'scripts', 'responsive-audit-baseline.json')
const updateBaseline = process.argv.includes('--update-baseline')

// The only allowed width media-query values: the shared breakpoint's min/max
// pair, derived from lib/responsive-tokens.ts. Legacy off-token values live in
// the baseline and shrink with each migration phase.
const allowedMediaWidthsPx = new Set([DESKTOP_MIN_WIDTH_PX, DESKTOP_MIN_WIDTH_PX - 1])

const checkHints: Record<CheckId, string> = {
  R1: 'raw header-offset viewport math — use .page-shell / .game-screen or var(--bd-header-h)',
  R2: 'width media query off the shared breakpoint — use the desk: screen / MOBILE_MAX_MEDIA_QUERY',
  R3: 'hardcoded width in matchMedia() — use useIsMobileViewport() / MOBILE_MAX_MEDIA_QUERY',
  R4: 'position:fixed with hardcoded header offset — use a shared shell primitive',
  R5: 'inline viewport-height calc in TSX style — use a shared shell primitive class',
  R6: 'width-only board sizing — cell size must be min(width-derived, height-derived from --game-h)',
  R7: 'new viewport-height screen family — use the shared .game-screen family (--game-h)',
}

const primitivesStartMarker = '@responsive-primitives-start'
const primitivesEndMarker = '@responsive-primitives-end'

function toPosixPath(value: string) {
  return value.split(path.sep).join('/')
}

function walkFiles(directory: string): string[] {
  const absoluteDirectory = path.join(repoRoot, directory)
  const files: string[] = []

  for (const entry of readdirSync(absoluteDirectory)) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const absolutePath = path.join(absoluteDirectory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      files.push(...walkFiles(path.relative(repoRoot, absolutePath)))
      continue
    }

    if (stats.isFile() && sourceExtensions.has(path.extname(entry))) {
      files.push(absolutePath)
    }
  }

  return files
}

function lineNumberAt(source: string, index: number) {
  let line = 1
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') {
      line++
    }
  }
  return line
}

function buildPrimitivesRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let searchFrom = 0

  while (true) {
    const start = source.indexOf(primitivesStartMarker, searchFrom)
    if (start === -1) {
      break
    }
    const end = source.indexOf(primitivesEndMarker, start)
    if (end === -1) {
      ranges.push([start, source.length])
      break
    }
    ranges.push([start, end])
    searchFrom = end + primitivesEndMarker.length
  }

  return ranges
}

function isInsidePrimitivesBlock(ranges: Array<[number, number]>, index: number) {
  return ranges.some(([start, end]) => index >= start && index <= end)
}

function isAllowedByComment(lines: string[], line: number, check: CheckId) {
  const allowPattern = new RegExp(`responsive-audit-allow\\(${check}\\)`)
  const current = lines[line - 1] ?? ''
  const previous = lines[line - 2] ?? ''
  return allowPattern.test(current) || allowPattern.test(previous)
}

function findAll(source: string, pattern: RegExp) {
  return [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))]
}

const headerOffsetCalcPattern = /calc\(\s*100[dsl]?vh\s*[-+]\s*(?:64px|4rem)/g
const mediaPreludePattern = /@media[^{]*/g
const mediaWidthConditionPattern = /\(\s*(?:min|max)-width:\s*([\d.]+)px/g
const tailwindArbitraryWidthPattern = /\b(?:min|max)-\[([\d.]+)px\]:/g
const deskBreakpointPattern = /--breakpoint-desk:\s*([\d.]+)px/g
const matchMediaWidthPattern = /matchMedia\(\s*[`'"][^`'"]*\(\s*(?:min|max)-width/g
const fixedTopOffsetPattern = /top:\s*['"`]?(?:64px|4rem)/g
const inlineViewportHeightPattern = /(?:height|minHeight|maxHeight)\s*:\s*[`'"][^`'"]*calc\([^)]*\b100[dsl]?vh/g
const widthOnlyBoardPattern = /(--[\w-]*cell[\w-]*|(?<![-\w])width)\s*:([^;}]*)/g
const screenFamilyVarPattern = /--[\w-]+-h\s*:\s*calc\(\s*100[dsl]?vh/g

function collectViolations(relativeFile: string, source: string): Violation[] {
  const violations: Violation[] = []
  const lines = source.split('\n')
  const extension = path.extname(relativeFile)
  const isCss = extension === '.css'
  const isTsx = extension === '.tsx' || extension === '.ts'
  const primitivesRanges = isCss ? buildPrimitivesRanges(source) : []

  const report = (check: CheckId, index: number, match: string) => {
    const line = lineNumberAt(source, index)
    if (isAllowedByComment(lines, line, check)) {
      return
    }
    violations.push({ file: relativeFile, line, check, match: match.trim().slice(0, 80) })
  }

  // R1 — raw header-offset viewport math (CSS + TSX, incl. Tailwind arbitrary values)
  for (const match of findAll(source, headerOffsetCalcPattern)) {
    if (isCss && isInsidePrimitivesBlock(primitivesRanges, match.index)) {
      continue
    }
    report('R1', match.index, match[0])
  }

  // R2 — width media queries / Tailwind width variants outside the allowed set
  if (isCss) {
    for (const prelude of findAll(source, mediaPreludePattern)) {
      for (const condition of findAll(prelude[0], mediaWidthConditionPattern)) {
        if (!allowedMediaWidthsPx.has(Number(condition[1]))) {
          report('R2', prelude.index + condition.index, condition[0])
        }
      }
    }
    for (const match of findAll(source, deskBreakpointPattern)) {
      if (Number(match[1]) !== DESKTOP_MIN_WIDTH_PX) {
        report('R2', match.index, match[0])
      }
    }
  }
  if (isTsx) {
    for (const match of findAll(source, tailwindArbitraryWidthPattern)) {
      if (!allowedMediaWidthsPx.has(Number(match[1]))) {
        report('R2', match.index, match[0])
      }
    }
  }

  // R3 — hardcoded width in matchMedia()
  if (isTsx) {
    for (const match of findAll(source, matchMediaWidthPattern)) {
      report('R3', match.index, match[0])
    }
  }

  // R4 — position:fixed with a hardcoded header top offset
  for (const match of findAll(source, fixedTopOffsetPattern)) {
    const windowStart = Math.max(0, match.index - 400)
    const surrounding = source.slice(windowStart, match.index + 400)
    if (/position:\s*['"`]?fixed/.test(surrounding)) {
      report('R4', match.index, match[0])
    }
  }

  // R5 — inline viewport-height calc in TSX styles (header-offset case is R1)
  if (isTsx) {
    for (const match of findAll(source, inlineViewportHeightPattern)) {
      if (headerOffsetCalcPattern.test(match[0])) {
        headerOffsetCalcPattern.lastIndex = 0
        continue
      }
      headerOffsetCalcPattern.lastIndex = 0
      report('R5', match.index, match[0])
    }
  }

  // R6 — width-only board/cell sizing: 100vw with no min() and no height var
  if (isCss) {
    for (const match of findAll(source, widthOnlyBoardPattern)) {
      const value = match[2]
      if (value.includes('100vw') && !value.includes('min(') && !/--[\w-]+-h/.test(value)) {
        report('R6', match.index, `${match[1]}:${value}`)
      }
    }
  }

  // R7 — a new viewport-height screen family variable outside the primitives block
  for (const match of findAll(source, screenFamilyVarPattern)) {
    if (isCss && isInsidePrimitivesBlock(primitivesRanges, match.index)) {
      continue
    }
    report('R7', match.index, match[0])
  }

  return violations
}

function groupCounts(violations: Violation[]) {
  const counts = new Map<string, number>()
  for (const violation of violations) {
    const key = `${violation.file} ${violation.check}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function loadBaseline(): BaselineEntry[] {
  if (!existsSync(baselinePath)) {
    return []
  }
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineEntry[]
}

// Token-sync guard: the CSS carrier of the header height must match the TS
// constant (they live in different languages, so nothing else ties them).
const globalsCss = readFileSync(path.join(repoRoot, 'app', 'globals.css'), 'utf8')
if (!globalsCss.includes(`--bd-header-h: ${HEADER_HEIGHT_PX}px`)) {
  console.error(
    `Responsive layout audit failed: app/globals.css must declare --bd-header-h: ${HEADER_HEIGHT_PX}px (in sync with HEADER_HEIGHT_PX in lib/responsive-tokens.ts).`
  )
  process.exit(1)
}

const violations: Violation[] = []

for (const absoluteFile of scanRoots.flatMap((root) => walkFiles(root))) {
  const relativeFile = toPosixPath(path.relative(repoRoot, absoluteFile))
  violations.push(...collectViolations(relativeFile, readFileSync(absoluteFile, 'utf8')))
}

const actualCounts = groupCounts(violations)

if (updateBaseline) {
  const entries: BaselineEntry[] = [...actualCounts.entries()]
    .map(([key, count]) => {
      const [file, check] = key.split(' ')
      return { file, check: check as CheckId, count }
    })
    .sort((a, b) => a.file.localeCompare(b.file) || a.check.localeCompare(b.check))
  writeFileSync(baselinePath, `${JSON.stringify(entries, null, 2)}\n`)
  console.log(`Responsive audit baseline updated: ${entries.length} entries, ${violations.length} legacy violations.`)
  process.exit(0)
}

const baseline = loadBaseline()
const baselineCounts = new Map(baseline.map((entry) => [`${entry.file} ${entry.check}`, entry.count]))

const newViolations: Violation[] = []
const staleEntries: Array<{ file: string; check: CheckId; expected: number; actual: number }> = []

for (const [key, actual] of actualCounts) {
  const allowed = baselineCounts.get(key) ?? 0
  if (actual > allowed) {
    const [file, check] = key.split(' ')
    newViolations.push(...violations.filter((v) => v.file === file && v.check === check))
  }
}

for (const [key, expected] of baselineCounts) {
  const actual = actualCounts.get(key) ?? 0
  if (actual < expected) {
    const [file, check] = key.split(' ')
    staleEntries.push({ file, check: check as CheckId, expected, actual })
  }
}

if (newViolations.length > 0 || staleEntries.length > 0) {
  console.error('Responsive layout audit failed:')
  for (const violation of newViolations) {
    console.error(
      `- ${violation.file}:${violation.line}: "${violation.match}" (${violation.check} — ${checkHints[violation.check]}; see docs/RESPONSIVE.md#${violation.check.toLowerCase()})`
    )
  }
  for (const entry of staleEntries) {
    console.error(
      `- stale baseline entry: ${entry.file} ${entry.check} expects ${entry.expected}, found ${entry.actual} — shrink it in this PR (npx tsx scripts/audit-responsive.ts --update-baseline)`
    )
  }
  process.exit(1)
}

console.log(`Responsive layout audit passed (${violations.length} legacy violations remain in the baseline).`)
