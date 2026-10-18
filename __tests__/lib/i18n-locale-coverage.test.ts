import { renderHook } from '@testing-library/react'
import i18n, { changeLanguageLazy } from '@/i18n'
import { useTranslation } from '@/lib/i18n-helpers'
import { availableLocales, defaultLocale } from '@/locales/meta'

type LocaleTree = Record<string, unknown>

function flattenKeys(node: LocaleTree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as LocaleTree, fullKey)
    }
    return [fullKey]
  })
}

describe('i18n locale coverage', () => {
  it('provides all English keys for every configured locale at runtime', async () => {
    // Non-'en' locales load lazily (see i18n.ts) — fetch each one before
    // checking its resource bundle for key parity against English.
    const enResources = i18n.getResourceBundle('en', 'translation') as LocaleTree
    const enKeys = new Set(flattenKeys(enResources))

    for (const locale of availableLocales.filter((code) => code !== defaultLocale)) {
      await changeLanguageLazy(locale)
      const localeResources = i18n.getResourceBundle(locale, 'translation') as LocaleTree
      const localeKeys = new Set(flattenKeys(localeResources))
      const missing = Array.from(enKeys).filter((key) => !localeKeys.has(key))
      expect(missing).toEqual([])
    }
  })

  it('keeps translation function reference stable between rerenders', () => {
    const { result, rerender } = renderHook(() => useTranslation())
    const firstT = result.current.t

    rerender()

    expect(result.current.t).toBe(firstT)
  })
})
