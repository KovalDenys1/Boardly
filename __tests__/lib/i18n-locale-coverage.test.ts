import { renderHook } from '@testing-library/react'
import i18n from '@/i18n'
import { useTranslation } from '@/lib/i18n-helpers'

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
  it('provides all English keys for every configured locale at runtime', () => {
    const resources = i18n.options.resources as Record<string, { translation: LocaleTree }>
    const enKeys = new Set(flattenKeys(resources.en.translation))

    for (const locale of ['uk', 'no', 'ru']) {
      const localeKeys = new Set(flattenKeys(resources[locale].translation))
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
