import { useTranslation as useTranslationOriginal } from 'react-i18next'
import type { Translation } from '@/locales'

// Type-safe translation keys
type TranslationKeys = RecursiveKeyOf<Translation>

type RecursiveKeyOf<TObj extends object> = {
  [TKey in keyof TObj & string]: TObj[TKey] extends object
    ? `${TKey}` | `${TKey}.${RecursiveKeyOf<TObj[TKey]>}`
    : `${TKey}`
}[keyof TObj & string]

/**
 * Type-safe useTranslation hook
 * 
 * Usage:
 * ```tsx
 * const { t } = useTranslation()
 * t('common.loading') // ✅ Type-safe
 * t('invalid.key')    // ❌ TypeScript error
 * ```
 */
type I18nTranslationHook = ReturnType<typeof useTranslationOriginal>
type TypedI18nTranslationHook = Omit<I18nTranslationHook, 't'> & {
  t: (key: TranslationKeys, options?: any) => string
}

export function useTranslation() {
  // Preserve the original hook object and `t` reference.
  // Re-wrapping `t` on every render can make `useEffect` dependencies unstable.
  return useTranslationOriginal() as unknown as TypedI18nTranslationHook
}

/**
 * Type-safe translation function for use outside components
 * 
 * Usage:
 * ```ts
 * import { t } from '@/lib/i18n-helpers'
 * const message = t('common.loading')
 * ```
 */
export function t(key: TranslationKeys, options?: any): string {
  // This requires i18n to be initialized
  const i18n = require('@/i18n').default
  return i18n.t(key, options)
}
