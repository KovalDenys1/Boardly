import type { Metadata } from 'next'

import { serverTranslator } from '@/lib/server-i18n'
import { OG_SITE_DEFAULTS, socialImages } from '@/lib/social-preview'
import {
  OG_LOCALES,
  languageAlternates,
  localizedPath,
  type PrefixedLocale,
} from '@/lib/seo-locales'

const BASE = 'https://boardly.online'

function urlOf(path: string, locale: PrefixedLocale): string {
  return `${BASE}${localizedPath(path, locale)}`
}

/** What each prefixed root layout (`app/ru`, `app/uk`, `app/no`, `app/de`, `app/es`) hands every page below it: the site defaults, in the locale. */
export function localizedSiteMetadata(site: Metadata, locale: PrefixedLocale): Metadata {
  const t = serverTranslator(locale)
  const title = t('home.seo.title')
  const description = t('home.seo.description')

  return {
    ...site,
    title: { default: title, template: '%s | Boardly' },
    description,
    keywords: null,
    openGraph: { ...site.openGraph, locale: OG_LOCALES[locale], url: urlOf('/', locale), title, description },
    twitter: { ...site.twitter, title, description },
  }
}

export function localizedHomeMetadata(locale: PrefixedLocale): Metadata {
  const t = serverTranslator(locale)
  return {
    title: { absolute: t('home.seo.title') },
    description: t('home.seo.description'),
    alternates: { canonical: urlOf('/', locale), languages: languageAlternates('/') },
  }
}

export function localizedGamesMetadata(locale: PrefixedLocale): Metadata {
  const t = serverTranslator(locale)
  const title = t('games.catalogSeo.title')
  const description = t('games.catalogSeo.description')
  const url = urlOf('/games', locale)
  const images = socialImages('games')

  return {
    title,
    description,
    openGraph: {
      ...OG_SITE_DEFAULTS,
      locale: OG_LOCALES[locale],
      images,
      title: `${title} | Boardly`,
      description,
      url,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', images, title: `${title} | Boardly`, description },
    alternates: { canonical: url, languages: languageAlternates('/games') },
  }
}
