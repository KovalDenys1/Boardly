import { availableLocales, defaultLocale, locales } from '../locales'

type LocaleTree = Record<string, unknown>

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

function diffKeys(base: Set<string>, target: Set<string>) {
  return {
    missing: Array.from(base).filter((key) => !target.has(key)),
    extra: Array.from(target).filter((key) => !base.has(key)),
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
