import { useMemo, useSyncExternalStore } from 'react'
import { useTranslation as useTranslationOriginal } from 'react-i18next'
import type { Translation } from '@/locales'
import { defaultLocale } from '@/locales/meta'
import { usePageLocale } from '@/lib/page-locale-context'

// Type-safe translation keys
export type TranslationKeys = RecursiveKeyOf<Translation>

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
 * t('common.loading') // ok, type-safe
 * t('invalid.key')    // TypeScript error
 * ```
 */
type I18nTranslationHook = ReturnType<typeof useTranslationOriginal>
type TypedI18nTranslationHook = Omit<I18nTranslationHook, 't'> & {
  t: (key: TranslationKeys, options?: string | Record<string, unknown>) => string
}

const subscribeToNothing = () => () => {}

function inLanguage(translation: TypedI18nTranslationHook, language: string): TypedI18nTranslationHook {
  const i18n = Object.assign(Object.create(translation.i18n), { language, resolvedLanguage: language })
  const t = translation.i18n.getFixedT(language)
  return Object.assign([t, i18n, translation.ready], { t, i18n, ready: translation.ready }) as unknown as TypedI18nTranslationHook
}

export function useTranslation() {
  // Preserve the original hook object and `t` reference.
  // Re-wrapping `t` on every render can make `useEffect` dependencies unstable.
  const translation = useTranslationOriginal() as unknown as TypedI18nTranslationHook
  const language = translation.i18n?.language
  const servedLanguage = usePageLocale() ?? defaultLocale
  // react-i18next passes its live snapshot as the server snapshot too, so hydration would read the switched language.
  const renderedLanguage = useSyncExternalStore(subscribeToNothing, () => language, () => servedLanguage)
  return useMemo(
    () => (!language || renderedLanguage === language ? translation : inLanguage(translation, renderedLanguage)),
    [translation, language, renderedLanguage]
  )
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
export function t(key: TranslationKeys, options?: string | Record<string, unknown>): string {
  // This requires i18n to be initialized
  const i18n = require('@/i18n').default
  return i18n.t(key, options)
}
