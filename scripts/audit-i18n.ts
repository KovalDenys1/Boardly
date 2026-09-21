import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import ts from 'typescript'

/**
 * i18n audit — keeps user-visible English out of JSX (#889).
 *
 * Every string a player reads has to come from `locales/*.ts` through `t()`,
 * or three of the four locales show English mid-sentence. #889 found that
 * happening in the middle of a game, not in a settings corner: the Alias round
 * summary and the Yahtzee scorecard.
 *
 * **This walks the TypeScript AST rather than matching text.** A regex over
 * `>...<` cannot tell JSX from a generic: `useState<Foo>(null)` looks exactly
 * like a text node, and on a first pass over this repo roughly half of what a
 * regex reported was type arguments and destructured code. The AST knows the
 * difference, so every finding here is genuinely a string the browser paints.
 *
 * What counts as a finding:
 *   - a `JsxText` node containing two or more letters
 *   - a plain-string `title`, `placeholder`, `aria-label` or `alt` attribute
 * `{t('key')}` is a JSX expression, not text, so translated strings never
 * appear here - which is the property that makes the count meaningful.
 *
 * Out of scope by directory, per the decision recorded in #889: `app/guides`
 * (SEO landing pages, 87 strings, may be English on purpose), `app/privacy`
 * and `app/terms` (legal copy), and `app/dev` (never shipped to a visitor).
 *
 * Escapes, both deliberate:
 *   - `scripts/i18n-allowlist.json` for whole files that are not player-facing
 *   - a comment `i18n-allow: reason` on the line or the line above
 *
 * Legacy debt lives in `scripts/i18n-baseline.json` as a ratchet, exactly like
 * audit-responsive and check-emoji: a file NOT in the baseline fails, and a
 * baseline count that exceeds reality fails, so the number can only go down.
 * Regenerate after a migration PR:
 *   npx tsx scripts/audit-i18n.ts --update-baseline
 */

type BaselineEntry = { file: string; count: number }
type Allowlist = { files: Record<string, string> }

const repoRoot = process.cwd()
const scanRoots = ['app', 'components']
const ignoredDirectories = new Set(['node_modules', '.next', '.git', 'coverage', 'reports'])

/**
 * Directory prefixes the audit does not judge. Kept as prefixes rather than
 * allowlist entries so a new file under `app/guides` is out of scope the day it
 * is written, instead of failing CI until someone remembers to list it.
 */
const outOfScopePrefixes = ['app/guides/', 'app/privacy/', 'app/terms/', 'app/dev/']

/** Attributes a screen reader or a tooltip renders verbatim. */
const userVisibleAttributes = new Set(['title', 'placeholder', 'aria-label', 'alt'])

const baselinePath = path.join(repoRoot, 'scripts', 'i18n-baseline.json')
const allowlistPath = path.join(repoRoot, 'scripts', 'i18n-allowlist.json')
const updateBaseline = process.argv.includes('--update-baseline')
const verbose = process.argv.includes('--list')

const optOutPattern = /i18n-allow(?:\([^)]*\))?:/
/** Two or more letters in a row - so "·", "—" and "1/2" are not copy. */
const hasWords = /\p{L}{2,}/u

/**
 * `&nbsp;`, `&mdash;`, `&#8203;` and friends survive in a `JsxText` node
 * verbatim, and their names are letters, so a spacer reads as English unless
 * they come out before the word test.
 */
const htmlEntity = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/')
}

function collectSourceFiles(root: string): string[] {
  const absoluteRoot = path.join(repoRoot, root)
  if (!statSafe(absoluteRoot)) return []

  const found: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirectories.has(entry)) continue
      const absolute = path.join(directory, entry)
      if (statSync(absolute).isDirectory()) {
        walk(absolute)
        continue
      }
      if (!absolute.endsWith('.tsx')) continue
      const relative = toPosixPath(path.relative(repoRoot, absolute))
      if (outOfScopePrefixes.some((prefix) => relative.startsWith(prefix))) continue
      found.push(relative)
    }
  }

  walk(absoluteRoot)
  return found
}

function statSafe(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}

export interface Finding {
  file: string
  line: number
  text: string
}

/**
 * The lines carrying an `i18n-allow:` comment, plus the line after each, since
 * a JSX attribute is usually annotated from the line above it.
 */
function optedOutLines(lines: string[]): Set<number> {
  const opted = new Set<number>()
  lines.forEach((line, index) => {
    if (!optOutPattern.test(line)) return
    opted.add(index + 1)
    opted.add(index + 2)
  })
  return opted
}

export function findUntranslatedStrings(file: string, source: string): Finding[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lines = source.split('\n')
  const opted = optedOutLines(lines)
  const findings: Finding[] = []

  const record = (node: ts.Node, text: string) => {
    const trimmed = text.trim()
    if (!hasWords.test(trimmed.replace(htmlEntity, ' '))) return
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    if (opted.has(line)) return
    findings.push({ file, line, text: trimmed.replace(/\s+/g, ' ') })
  }

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      record(node, node.text)
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile)
      const initializer = node.initializer
      if (userVisibleAttributes.has(name) && initializer && ts.isStringLiteral(initializer)) {
        record(node, initializer.text)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

function readJson<T>(target: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(target, 'utf8')) as T
  } catch {
    return fallback
  }
}

function main() {
  const allowlist = readJson<Allowlist>(allowlistPath, { files: {} })
  const baseline = readJson<BaselineEntry[]>(baselinePath, [])
  const baselineByFile = new Map(baseline.map((entry) => [entry.file, entry.count]))

  const files = scanRoots.flatMap(collectSourceFiles).sort()
  const countsByFile = new Map<string, Finding[]>()

  for (const file of files) {
    if (allowlist.files[file]) continue
    const findings = findUntranslatedStrings(file, readFileSync(path.join(repoRoot, file), 'utf8'))
    if (findings.length > 0) countsByFile.set(file, findings)
  }

  if (updateBaseline) {
    const next: BaselineEntry[] = [...countsByFile.entries()]
      .map(([file, findings]) => ({ file, count: findings.length }))
      .sort((left, right) => left.file.localeCompare(right.file))
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
    const total = next.reduce((sum, entry) => sum + entry.count, 0)
    console.log(`i18n baseline written — ${next.length} files / ${total} strings`)
    return
  }

  const failures: string[] = []

  for (const [file, findings] of countsByFile) {
    const allowed = baselineByFile.get(file)
    if (allowed === undefined) {
      failures.push(`${file}: ${findings.length} untranslated string(s), not in the baseline`)
      if (verbose) for (const f of findings) failures.push(`    ${f.line}: ${JSON.stringify(f.text)}`)
      continue
    }
    if (findings.length > allowed) {
      failures.push(`${file}: ${findings.length} untranslated string(s), baseline allows ${allowed}`)
      if (verbose) for (const f of findings) failures.push(`    ${f.line}: ${JSON.stringify(f.text)}`)
    }
  }

  // A baseline entry larger than reality is also a failure: it would let the
  // debt grow back silently up to the old number after a migration PR.
  for (const entry of baseline) {
    const actual = countsByFile.get(entry.file)?.length ?? 0
    if (actual < entry.count) {
      failures.push(
        `${entry.file}: ${actual} untranslated string(s) but the baseline still claims ${entry.count} — shrink it in this PR`
      )
    }
  }

  const total = [...countsByFile.values()].reduce((sum, findings) => sum + findings.length, 0)

  if (failures.length > 0) {
    console.error('i18n audit failed:\n')
    for (const failure of failures) console.error(`  ${failure}`)
    console.error(`\n${total} untranslated string(s) in ${countsByFile.size} file(s).`)
    console.error('Wrap them in t() with keys in all four locales, or annotate with `i18n-allow: reason`.')
    process.exit(1)
  }

  console.log(`i18n audit ok — ${total} legacy string(s) in ${countsByFile.size} file(s) still in baseline`)
}

if (require.main === module) {
  main()
}
