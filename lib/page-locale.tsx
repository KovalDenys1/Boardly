'use client'

import { useCallback, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import type { i18n as I18n } from 'i18next'

import i18n from '@/i18n'
import { createLocaleI18n } from '@/lib/locale-i18n'
import { PageLocaleContext, usePageLocale } from '@/lib/page-locale-context'
import { localizeHref, type PrefixedLocale } from '@/lib/seo-locales'

export { usePageLocale }

const instances = new Map<PrefixedLocale, I18n>()

function instanceFor(locale: PrefixedLocale, translation: object): I18n {
  let instance = instances.get(locale)
  if (!instance) {
    instance = createLocaleI18n(locale, translation)
    instances.set(locale, instance)
    // i18n.ts took its language from <html lang>; toasts and helpers that use it need the text too.
    if (!i18n.hasResourceBundle(locale, 'translation')) {
      i18n.addResourceBundle(locale, 'translation', translation, true, true)
    }
  }
  return instance
}

/** Every `useTranslation()` below reads the URL's locale, in the server HTML and after hydration. */
export function PageLocaleProvider({
  locale,
  translation,
  children,
}: {
  locale: PrefixedLocale
  translation: object
  children: ReactNode
}) {
  return (
    <PageLocaleContext.Provider value={locale}>
      <I18nextProvider i18n={instanceFor(locale, translation)}>{children}</I18nextProvider>
    </PageLocaleContext.Provider>
  )
}

/** Turns an unprefixed href into the one this page should link: /ru/games on /ru, /games elsewhere. */
export function useLocalizedHref(): (href: string) => string {
  const locale = usePageLocale()
  return useCallback((href: string) => (locale ? localizeHref(href, locale) : href), [locale])
}
