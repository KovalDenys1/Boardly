import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { locales } from '../locales'

/**
 * Locale health — three checks on what a player would actually receive.
 *
 * `audit-i18n.ts` asks a structural question: is there an English literal in
 * the source. `check-locales.ts` asks whether the four key sets match. Neither
 * looks at the *values*, and every i18n fault of 2026-09-21 lived in a value:
 * a Russian label that was still English, two keys holding one string, a
 * count sentence with the wrong case. This file checks the bundles themselves.
 *
 * 1. **Placeholder parity.** If `en` says `Set up your {{game}} room` and the
 *    Russian translation loses `{{game}}`, i18next interpolates nothing and the
 *    game's name silently vanishes from the sentence - no error, no test
 *    failure, just a hole in the copy. This is a hard gate: the repo is at zero
 *    mismatches today and there is no legitimate reason to introduce one.
 *
 * 2. **Duplicate values inside a namespace**, ratcheted. Two keys holding one
 *    string is how `game.ui.versus` and `game.ui.vs` both came to exist, which
 *    is the drift #889 was written to stop. But it is deliberately NOT a hard
 *    gate: `lobby.create.title` and `lobby.create.create` are both "Create
 *    Lobby" in English and must stay separate, because Russian wants
 *    "Создание лобби" for the heading and "Создать" for the button. Forcing a
 *    merge would ship a worse bug than the one being prevented. So the 14 that
 *    exist today are baselined and only a *new* pair fails.
 *
 * 3. **Non-English values identical to English**, ratcheted. A leftover English
 *    string in ru/uk/no reads as a bug to a player. Most current matches are
 *    real words in those languages - "Premium", "FAQ", "ID", "Discord", "Pause"
 *    in Norwegian - so this is baselined too.
 *
 * Regenerate after a deliberate change:
 *   npx tsx scripts/audit-locale-health.ts --update-baseline
 */

type Baseline = {
  duplicateValues: string[]
  untranslated: string[]
}

const repoRoot = process.cwd()
const baselinePath = path.join(repoRoot, 'scripts', 'locale-health-baseline.json')
const updateBaseline = process.argv.includes('--update-baseline')

const BASE_LOCALE = 'en'
const OTHER_LOCALES = ['no', 'ru', 'uk'] as const

/** Two or more letters, so "·", "1/2" and "{{count}}" alone are not copy. */
const hasWords = /\p{L}{2,}/u
const placeholderPattern = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

type Flat = Record<string, string>

function flatten(value: unknown, prefix = ''): Flat {
  if (typeof value === 'string') return { [prefix]: value }
  if (!value || typeof value !== 'object') return {}

  const out: Flat = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key))
  }
  return out
}

/** The placeholder names a string interpolates, sorted so order does not matter. */
function placeholders(value: string): string {
  return [...value.matchAll(placeholderPattern)].map((match) => match[1]).sort().join(',')
}

function namespaceOf(key: string): string {
  return key.split('.').slice(0, -1).join('.')
}

/**
 * A CLDR plural suffix. `foo` and `foo_one` holding the same English string is
 * not drift - English has two forms where the base and `_one` coincide - so
 * these are compared by their base key, not reported as duplicates of it.
 */
const pluralSuffix = /_(zero|one|two|few|many|other)$/

function baseKey(key: string): string {
  return key.replace(pluralSuffix, '')
}

export interface LocaleHealthReport {
  placeholderMismatches: string[]
  duplicateValues: string[]
  untranslated: string[]
}

export function inspectLocales(bundles: Record<string, unknown>): LocaleHealthReport {
  const base = flatten(bundles[BASE_LOCALE])

  const placeholderMismatches: string[] = []
  const untranslated: string[] = []

  for (const locale of OTHER_LOCALES) {
    const other = flatten(bundles[locale])
    for (const [key, englishValue] of Object.entries(base)) {
      const translated = other[key]
      if (typeof translated !== 'string') continue

      if (placeholders(englishValue) !== placeholders(translated)) {
        placeholderMismatches.push(
          `${locale} ${key}: en interpolates [${placeholders(englishValue) || 'none'}], ${locale} interpolates [${placeholders(translated) || 'none'}]`
        )
      }

      if (englishValue === translated && hasWords.test(englishValue)) {
        untranslated.push(`${locale} ${key} = ${JSON.stringify(englishValue)}`)
      }
    }
  }

  // Duplicates are judged on the English bundle: it is the source the other
  // three are written from, so a pair that collides here is a pair a translator
  // will be asked to translate twice.
  const seenInNamespace = new Map<string, Map<string, string[]>>()
  for (const [key, value] of Object.entries(base)) {
    if (!hasWords.test(value)) continue
    const namespace = namespaceOf(key)
    const byValue = seenInNamespace.get(namespace) ?? new Map<string, string[]>()
    byValue.set(value, [...(byValue.get(value) ?? []), key])
    seenInNamespace.set(namespace, byValue)
  }

  const duplicateValues: string[] = []
  for (const [namespace, byValue] of seenInNamespace) {
    for (const [value, keys] of byValue) {
      // Collapse plural families: `x`, `x_one` and `x_other` are one key.
      const distinct = [...new Set(keys.map(baseKey))]
      if (distinct.length < 2) continue
      duplicateValues.push(`${namespace}: ${JSON.stringify(value)} — ${distinct.sort().join(', ')}`)
    }
  }

  return {
    placeholderMismatches: placeholderMismatches.sort(),
    duplicateValues: duplicateValues.sort(),
    untranslated: untranslated.sort(),
  }
}

function readBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline
  } catch {
    return { duplicateValues: [], untranslated: [] }
  }
}

function main() {
  const report = inspectLocales(locales as unknown as Record<string, unknown>)

  if (updateBaseline) {
    const next: Baseline = {
      duplicateValues: report.duplicateValues,
      untranslated: report.untranslated,
    }
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
    console.log(
      `locale health baseline written — ${next.duplicateValues.length} duplicate value(s), ${next.untranslated.length} untranslated string(s)`
    )
    return
  }

  const baseline = readBaseline()
  const failures: string[] = []

  // 1. Placeholder parity is a hard gate, not a ratchet.
  for (const mismatch of report.placeholderMismatches) {
    failures.push(`placeholder lost or invented: ${mismatch}`)
  }

  const ratchet = (name: string, current: string[], allowed: string[]) => {
    const allowedSet = new Set(allowed)
    for (const entry of current) {
      if (!allowedSet.has(entry)) failures.push(`new ${name}: ${entry}`)
    }
    // A baseline entry that no longer holds must shrink in the same change,
    // or the debt can silently grow back to the old number.
    const currentSet = new Set(current)
    for (const entry of allowed) {
      if (!currentSet.has(entry)) {
        failures.push(`${name} fixed but still in the baseline, shrink it in this PR: ${entry}`)
      }
    }
  }

  ratchet('duplicate value', report.duplicateValues, baseline.duplicateValues)
  ratchet('untranslated string', report.untranslated, baseline.untranslated)

  if (failures.length > 0) {
    console.error('locale health audit failed:\n')
    for (const failure of failures) console.error(`  ${failure}`)
    console.error(
      '\nA placeholder must appear in every locale or its value vanishes from the sentence.'
    )
    console.error(
      'A new duplicate means two keys for one string; merge them, or baseline the pair if the languages need them apart.'
    )
    console.error('Regenerate after a deliberate change: npx tsx scripts/audit-locale-health.ts --update-baseline')
    process.exit(1)
  }

  console.log(
    `locale health ok — 0 placeholder mismatches, ${report.duplicateValues.length} baselined duplicate(s), ${report.untranslated.length} baselined untranslated string(s)`
  )
}

if (require.main === module) {
  main()
}
