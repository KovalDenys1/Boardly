import { availableLocales, defaultLocale, locales } from '../locales'

type LocaleTree = Record<string, unknown>

/**
 * The CLDR plural categories i18next appends to a key when `count` is passed.
 * Which ones a language actually uses comes from `Intl.PluralRules`: English
 * and Norwegian use `one`/`other`, Russian and Ukrainian use
 * `one`/`few`/`many`/`other`.
 */
const pluralCategories = ['zero', 'one', 'two', 'few', 'many', 'other'] as const

const pluralSuffixPattern = new RegExp(`_(?:${pluralCategories.join('|')})$`)

function isRecord(value: unknown): value is LocaleTree {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function flattenKeys(node: LocaleTree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (isRecord(value)) {
      return flattenKeys(value, fullKey)
    }
    return [fullKey]
  })
}

/**
 * Russian and Ukrainian need three plural forms where English needs two, so a
 * locale may legitimately carry `lobby.invite.send_few` while `en` carries only
 * `lobby.invite.send` and `lobby.invite.send_other` (#1059). Without this the
 * parity gate below - the thing that keeps the locales honest - is also the
 * thing that makes correct Russian grammar impossible to express.
 *
 * The allowance is deliberately narrow, and is NOT "anything with an underscore
 * passes": the key has to end in a CLDR plural category AND the key with that
 * suffix removed has to exist in `en`. So `lobby.invite.snd_few` (typo in the
 * base) and `lobby.invite.send_plenty` (not a category) both still fail, and a
 * key missing from a locale still fails whatever it is named.
 */
function isPluralFormOfBaseKey(key: string, baseKeys: Set<string>): boolean {
  const match = pluralSuffixPattern.exec(key)
  if (!match) return false
  return baseKeys.has(key.slice(0, match.index))
}

function diffKeys(base: Set<string>, target: Set<string>) {
  return {
    missing: Array.from(base).filter((key) => !target.has(key)),
    extra: Array.from(target).filter(
      (key) => !base.has(key) && !isPluralFormOfBaseKey(key, base)
    ),
  }
}

function formatExamples(keys: string[]): string {
  if (keys.length === 0) return '(none)'
  return keys.slice(0, 25).join(', ')
}

const fallbackLocale = locales[defaultLocale] as unknown as LocaleTree
const fallbackKeys = new Set(flattenKeys(fallbackLocale))
let hasMismatch = false

for (const locale of availableLocales) {
  if (locale === defaultLocale) continue

  const localeTree = locales[locale] as unknown as LocaleTree
  const localeKeys = new Set(flattenKeys(localeTree))
  const { missing, extra } = diffKeys(fallbackKeys, localeKeys)

  if (missing.length === 0 && extra.length === 0) {
    continue
  }

  hasMismatch = true
  console.error(`\nLocale "${locale}" is out of sync with "${defaultLocale}":`)
  console.error(`- Missing keys (${missing.length}): ${formatExamples(missing)}`)
  console.error(`- Extra keys (${extra.length}): ${formatExamples(extra)}`)
}

if (hasMismatch) {
  console.error('\nLocale check failed. Keep locale keys synchronized with the default locale.')
  process.exit(1)
}

console.log('Locale key parity check passed.')
