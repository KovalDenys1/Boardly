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
export function useTranslation() {
  const translation = useTranslationOriginal()
  
  return {
    ...translation,
    t: (key: TranslationKeys, options?: any): string => translation.t(key, options) as string,
  }
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
