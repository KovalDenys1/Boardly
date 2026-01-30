import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translation files from TypeScript modules
import { locales, defaultLocale, availableLocales } from './locales'
import type { Locale } from './locales'

// Initialize i18next
i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources: {
      en: { translation: locales.en },
      uk: { translation: locales.uk },
      no: { translation: locales.no },
      ru: { translation: locales.ru },
    },
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


