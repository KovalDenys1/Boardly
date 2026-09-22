import type { Metadata } from 'next'

import { BOARDLY_URL, ORGANIZATION_ID } from './organization-json-ld'
import { getGuideBySlug, type GuideEntry } from './guides-catalog'

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

/** `https://boardly.online/guides/how-to-play-yahtzee-online` */
export function getGuideCanonical(slug: string): string {
  return `${BOARDLY_URL}/guides/${getGuideBySlug(slug).slug}`
}

function resolve(slug: string): { guide: GuideEntry; url: string } {
  const guide = getGuideBySlug(slug)
  return { guide, url: `${BOARDLY_URL}/guides/${guide.slug}` }
}

export function buildGuideMetadata(slug: string): Metadata {
  const { guide, url } = resolve(slug)
  const { seo } = guide
  const ogTitle = `${seo.ogTitle}${TITLE_SUFFIX}`

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    openGraph: {
      title: ogTitle,
      description: seo.ogDescription,
      url,
      type: 'article',
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: seo.ogDescription,
    },
    alternates: { canonical: url },
    robots: { index: true, follow: true },
  }
}

/**
 * `author` and `publisher` point at the Organization node the root layout
 * already embeds, rather than repeating a second copy of it inline the way
 * all twelve guides did. Google resolves the `@id`; two differing copies of
 * one organization on the same page are what it cannot resolve.
 */
export function buildGuideArticleJsonLd(slug: string): Record<string, unknown> {
  const { guide, url } = resolve(slug)

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.seo.headline,
    description: guide.seo.articleDescription,
    url,
    image: `${BOARDLY_URL}/opengraph-image`,
    datePublished: guide.published,
    dateModified: guide.updated,
    inLanguage: 'en',
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
  }
}

export function buildGuideBreadcrumbJsonLd(slug: string): Record<string, unknown> {
  const { guide, url } = resolve(slug)

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BOARDLY_URL },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${BOARDLY_URL}/guides` },
      { '@type': 'ListItem', position: 3, name: guide.seo.breadcrumbLabel, item: url },
    ],
  }
}
