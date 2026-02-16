import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translation files from TypeScript modules
import { locales, defaultLocale, availableLocales } from './locales'
import type { Locale } from './locales'

type TranslationRecord = Record<string, unknown>

function deepMergeWithFallback(
  fallback: TranslationRecord,
  locale: TranslationRecord
): TranslationRecord {
  const merged: TranslationRecord = { ...fallback }

  for (const [key, value] of Object.entries(locale)) {
    const fallbackValue = fallback[key]

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      fallbackValue &&
      typeof fallbackValue === 'object' &&
      !Array.isArray(fallbackValue)
    ) {
      merged[key] = deepMergeWithFallback(
        fallbackValue as TranslationRecord,
        value as TranslationRecord
      )
      continue
    }

    merged[key] = value
  }

  return merged
}

const fallbackLocale = locales.en as unknown as TranslationRecord
const resources = {
  en: { translation: fallbackLocale },
  uk: {
    translation: deepMergeWithFallback(
      fallbackLocale,
      locales.uk as unknown as TranslationRecord
    ),
  },
  no: {
    translation: deepMergeWithFallback(
      fallbackLocale,
      locales.no as unknown as TranslationRecord
    ),
  },
  ru: {
    translation: deepMergeWithFallback(
      fallbackLocale,
      locales.ru as unknown as TranslationRecord
    ),
  },
}

// Initialize i18next
i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources,
    fallbackLng: defaultLocale,
    supportedLngs: availableLocales,
    interpolation: {
      escapeValue: false, // React already does escaping
    },
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    react: {
      useSuspense: false, // Disable suspense to avoid hydration issues
    },
  })

export default i18n
export { availableLocales, defaultLocale }
export type { Locale }

