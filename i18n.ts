import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translation files
import en from './messages/en.json'
import uk from './messages/uk.json'

export const locales = ['en', 'uk'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

// Initialize i18next
i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources: {
      en: { translation: en },
      uk: { translation: uk },
    },
    fallbackLng: defaultLocale,
    supportedLngs: locales,
    interpolation: {
      escapeValue: false, // React already does escaping
    },
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  })

export default i18n


