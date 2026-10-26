import type { Metadata } from 'next'

import en from '../locales/en'
import {
  getCatalogEntryById,
  getCatalogGames,
  getGameMetadata,
  hasBotSupport,
  type GameSeo,
} from './game-catalog'
import { OG_SITE_DEFAULTS, gameSocialCardKey, socialImages } from './social-preview'
import { OG_LOCALES, languageAlternates, localizedPath, type SeoLocale } from './seo-locales'
import { serverTranslator } from './server-i18n'

/**
 * One builder for every `/games/<game>` page's metadata and structured data
 * (#929). The copy lives on the catalog entry's `seo` block; everything else
 * here is derived, so a page can no longer claim a player count, a play mode
 * or a URL that disagrees with the game it describes – eight hand-maintained
 * copies of this block managed exactly that (Memory and Rock Paper Scissors
 * both advertised `MultiPlayer` only while both have had bots for months).
 */

const BASE = 'https://boardly.online'
const TITLE_SUFFIX = ' | Boardly'

/** What a visitor actually reads in the tab and the search result. */
export function renderedTitle(seo: GameSeo): string {
  return `${seo.title}${TITLE_SUFFIX}`
}

type ResolvedGame = {
  seo: GameSeo
  /** `games.alias` – the locale namespace the game's text lives under. */
  namespace: string
  nameKey: string
  /** `/games/connect-four` – the detail page, not the lobbies list under it. */
  path: string
  /** English display name, from the engine's own metadata. */
  name: string
  minPlayers: number
  maxPlayers: number
  supportsBots: boolean
}

function resolveGame(id: string): ResolvedGame {
  const entry = getCatalogEntryById(id)
  if (!entry?.seo) throw new Error(`No SEO block for catalog game "${id}"`)
  if (!entry.route) throw new Error(`Catalog game "${id}" has no route`)
  if (!entry.gameType) throw new Error(`Catalog game "${id}" has no gameType`)

  const meta = getGameMetadata(entry.gameType)
  if (!meta) throw new Error(`No engine metadata for game type "${entry.gameType}"`)

  // The player range shown on the page and offered by the lobby form, not the
  // engine's floor: Alias accepts three teams of one but the create form never
  // offers fewer than four, so four is the number the site can keep.
  const [min, max] = entry.players.split('-').map((part) => Number(part.trim()))

  return {
    seo: entry.seo,
    namespace: entry.seo.questionKey.replace(/\.seo\.question$/, ''),
    nameKey: entry.nameKey,
    path: entry.route.replace(/\/lobbies$/, ''),
    name: meta.name,
    minPlayers: min,
    maxPlayers: max,
    supportsBots: hasBotSupport(entry.gameType),
  }
}

/** The English text behind a locale key – the JSON-LD stays English whatever the visitor reads. */
export function englishText(key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  if (typeof value !== 'string') throw new Error(`Locale key "${key}" is missing from locales/en`)
  return value
}

export function getGameCanonical(id: string): string {
  return `${BASE}${resolveGame(id).path}`
}

/** The catalog id behind `/games/<slug>`: `rock-paper-scissors` is `rps`. */
export function gameIdForSlug(slug: string): string {
  const entry = getCatalogGames().find((game) => game.seo && game.route === `/games/${slug}/lobbies`)
  if (!entry) throw new Error(`No catalog game has a page at /games/${slug}`)
  return entry.id
}

/**
 * `index: false` keeps a game out of the index while it is in development –
 * the page still exists and still carries its canonical, the way
 * `/games/liars-party` has since it shipped behind the flag.
 */
export function buildGameMetadata(id: string, options?: { index?: boolean; locale?: SeoLocale }): Metadata {
  const { seo, path, namespace } = resolveGame(id)
  const locale = options?.locale ?? 'en'
  const pagePath = localizedPath(path, locale)
  const url = `${BASE}${pagePath}`
  const t = locale === 'en' ? null : serverTranslator(locale)
  const pageTitle = t ? t(`${namespace}.seo.title`) : seo.title
  const description = t ? t(`${namespace}.seo.description`) : seo.description
  const title = `${pageTitle}${TITLE_SUFFIX}`

  const images = socialImages(gameSocialCardKey(id))

  return {
    title: pageTitle,
    description,
    ...(t ? {} : { keywords: seo.synonyms }),
    openGraph: {
      ...OG_SITE_DEFAULTS,
      locale: OG_LOCALES[locale],
      images,
      title,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      images,
      title,
      description,
    },
    alternates: { canonical: url, languages: languageAlternates(path) },
    robots: { index: options?.index ?? true, follow: true },
  }
}

/**
 * VideoGame, BreadcrumbList and the page's FAQ. The FAQ carries the question
 * and answer the page renders above the fold, then every entry of the
 * catalog's `faq` – which the page renders under `#faq` – and nothing else:
 * structured data whose answer a visitor cannot find on the page is a
 * violation (#923).
 */
export function buildGameJsonLd(id: string, locale: SeoLocale = 'en'): Record<string, unknown>[] {
  const { seo, path, namespace, nameKey, name, minPlayers, maxPlayers, supportsBots } = resolveGame(id)
  const t = locale === 'en' ? null : serverTranslator(locale)
  const text = (key: string) => (t ? t(key) : englishText(key))
  const at = (pagePath: string) => {
    const localized = localizedPath(pagePath, locale)
    return localized === '/' ? BASE : `${BASE}${localized}`
  }
  const url = at(path)
  const gameName = t ? t(nameKey) : name

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: gameName,
      description: t ? t(`${namespace}.seo.description`) : seo.schemaDescription,
      url,
      image: `${BASE}/opengraph-image`,
      genre: seo.genre,
      numberOfPlayers: {
        '@type': 'QuantitativeValue',
        minValue: minPlayers,
        maxValue: maxPlayers,
      },
      playMode: supportsBots ? ['MultiPlayer', 'SinglePlayer'] : 'MultiPlayer',
      applicationCategory: 'Game',
      operatingSystem: 'Any (Browser)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@type': 'Organization', name: 'Boardly', url: BASE },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t ? t('breadcrumbs.home') : 'Home', item: at('/') },
        { '@type': 'ListItem', position: 2, name: t ? t('breadcrumbs.games') : 'Games', item: at('/games') },
        { '@type': 'ListItem', position: 3, name: gameName, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      // The direct answer first, then the page's own FAQ section – the same
      // entries in the same order the visitor reads them.
      mainEntity: [{ questionKey: seo.questionKey, answerKey: seo.answerKey }, ...(seo.faq ?? [])].map(
        ({ questionKey, answerKey }) => ({
          '@type': 'Question',
          name: text(questionKey),
          acceptedAnswer: { '@type': 'Answer', text: text(answerKey) },
        })
      ),
    },
  ]
}
