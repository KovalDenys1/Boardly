import { createInstance, type i18n as I18n } from 'i18next'

import en from '@/locales/en'
import { defaultLocale, type Locale } from '@/locales/meta'

/** Fixed to one locale, unlike `i18n.ts`, whose language follows the visitor's stored choice. */
export function createLocaleI18n(locale: Locale, translation: object): I18n {
  const instance = createInstance()
  void instance.init({
    lng: locale,
    fallbackLng: defaultLocale,
    resources: {
      [defaultLocale]: { translation: en },
      ...(locale === defaultLocale ? {} : { [locale]: { translation } }),
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    initAsync: false,
  })
  return instance
}
