import type { Metadata } from 'next'

import { getGuideCard } from './guide-cards'
import { BOARDLY_URL, ORGANIZATION_ID } from './organization-json-ld'
import { getGuideBySlug, type LocalizedGuideSeo } from './guides-catalog'
import { HREFLANG, OG_LOCALES, languageAlternates, localizedPath, type PrefixedLocale, type SeoLocale } from './seo-locales'
import { serverTranslator } from './server-i18n'
import { OG_SITE_DEFAULTS, guideSocialCardKey, socialImages } from './social-preview'

/**
 * One builder for every `/guides/<slug>` page's head, the way
 * `lib/game-seo.ts` is for the game pages. Twelve guides hand-wrote a metadata
 * object, an Article node and a BreadcrumbList each: none of the twelve
 * carried a Twitter card, four claimed a `datePublished` of 2025-01-01 (before
 * the site existed), and every one of them repeated the canonical URL three
 * times. The copy lives on the catalog entry's `seo` block; everything else is
 * derived from the slug, so a guide can no longer name a URL, a date or a
 * breadcrumb that disagrees with the catalog.
 */

const TITLE_SUFFIX = ' | Boardly'

/** A guide in one of the prefixed languages: its `<head>` copy, from the translation itself. */
export interface GuideTranslation {
  locale: PrefixedLocale
  seo: LocalizedGuideSeo
}

/** `https://boardly.online/guides/how-to-play-yahtzee-online` */
export function getGuideCanonical(slug: string): string {
  return `${BOARDLY_URL}/guides/${getGuideBySlug(slug).slug}`
}

function resolve(slug: string, translation?: GuideTranslation) {
  const guide = getGuideBySlug(slug)
  const locale: SeoLocale = translation?.locale ?? 'en'
  const at = (path: string) => {
    const localized = localizedPath(path, locale)
    return localized === '/' ? BOARDLY_URL : `${BOARDLY_URL}${localized}`
  }
  const card = getGuideCard(guide.slug, locale)
  return {
    guide,
    locale,
    path: `/guides/${guide.slug}`,
    url: at(`/guides/${guide.slug}`),
    at,
    seo: translation?.seo ?? guide.seo,
    published: card.published,
    updated: card.updated,
  }
}

export function buildGuideMetadata(slug: string, translation?: GuideTranslation): Metadata {
  const { guide, path, url, seo, published, updated } = resolve(slug, translation)
  const ogTitle = `${seo.ogTitle}${TITLE_SUFFIX}`

  const images = socialImages(guideSocialCardKey(guide.slug))

  return {
    title: seo.title,
    description: seo.description,
    ...(translation ? {} : { keywords: guide.seo.keywords }),
    openGraph: {
      ...OG_SITE_DEFAULTS,
      ...(translation ? { locale: OG_LOCALES[translation.locale] } : {}),
      images,
      title: ogTitle,
      description: seo.ogDescription,
      url,
      type: 'article',
      publishedTime: published,
      modifiedTime: updated,
    },
    twitter: {
      card: 'summary_large_image',
      images,
      title: ogTitle,
      description: seo.ogDescription,
    },
    alternates: { canonical: url, languages: languageAlternates(path) },
    robots: { index: true, follow: true },
  }
}

/**
 * `author` and `publisher` point at the Organization node the root layout
 * already embeds, rather than repeating a second copy of it inline the way
 * all twelve guides did. Google resolves the `@id`; two differing copies of
 * one organization on the same page are what it cannot resolve.
 */
export function buildGuideArticleJsonLd(slug: string, translation?: GuideTranslation): Record<string, unknown> {
  const { locale, url, seo, published, updated } = resolve(slug, translation)

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: seo.headline,
    description: seo.articleDescription,
    url,
    image: `${BOARDLY_URL}/opengraph-image`,
    datePublished: published,
    dateModified: updated,
    inLanguage: HREFLANG[locale],
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
  }
}

export function buildGuideBreadcrumbJsonLd(slug: string, translation?: GuideTranslation): Record<string, unknown> {
  const { locale, url, at, seo } = resolve(slug, translation)
  const t = serverTranslator(locale)

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumbs.home'), item: at('/') },
      { '@type': 'ListItem', position: 2, name: t('header.guides'), item: at('/guides') },
      { '@type': 'ListItem', position: 3, name: seo.breadcrumbLabel, item: url },
    ],
  }
}
