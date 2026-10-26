import type { TFunction } from 'i18next'

import { locales } from '@/locales'
import type { Locale } from '@/locales/meta'
import { createLocaleI18n } from '@/lib/locale-i18n'

// One per locale, shared between requests: the singleton in i18n.ts would carry one request's language into the next.
const translators = new Map<Locale, TFunction>()

export function serverTranslator(locale: Locale): TFunction {
  const cached = translators.get(locale)
  if (cached) return cached

  const t = createLocaleI18n(locale, locales[locale]).getFixedT(locale)
  translators.set(locale, t)
  return t
}
