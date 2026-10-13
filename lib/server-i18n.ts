import { createInstance, type TFunction } from 'i18next'

import { locales } from '@/locales'
import { defaultLocale, type Locale } from '@/locales/meta'

/**
 * A translator for server rendering (#1394). `i18n.ts` is one module-level
 * instance whose language a visitor's stored choice switches, so on the server
 * it would carry one request's language into the next. Each locale gets its
 * own instance here instead, built once: the text for a locale is the same for
 * every visitor, so sharing it per locale is safe where sharing one is not.
 */
const translators = new Map<Locale, TFunction>()

export function serverTranslator(locale: Locale): TFunction {
  const cached = translators.get(locale)
  if (cached) return cached

  const instance = createInstance()
  void instance.init({
    lng: locale,
    fallbackLng: defaultLocale,
    resources: {
      [defaultLocale]: { translation: locales[defaultLocale] },
      ...(locale === defaultLocale ? {} : { [locale]: { translation: locales[locale] } }),
    },
    interpolation: { escapeValue: false },
    initAsync: false,
  })

  const t = instance.getFixedT(locale)
  translators.set(locale, t)
  return t
}
