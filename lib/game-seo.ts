import type { Metadata } from 'next'

import en from '../locales/en'
import {
  getCatalogEntryById,
  getGameMetadata,
  hasBotSupport,
  type GameSeo,
} from './game-catalog'

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

/**
 * `index: false` keeps a game out of the index while it is in development –
 * the page still exists and still carries its canonical, the way
 * `/games/liars-party` has since it shipped behind the flag.
 */
export function buildGameMetadata(id: string, options?: { index?: boolean }): Metadata {
  const { seo, path } = resolveGame(id)
  const url = `${BASE}${path}`
  const title = renderedTitle(seo)

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.synonyms,
    openGraph: {
      title,
      description: seo.description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: seo.description,
    },
    alternates: { canonical: url },
    robots: { index: options?.index ?? true, follow: true },
  }
}

/**
 * VideoGame, BreadcrumbList and the page's one FAQ entry. The FAQ carries the
 * same question and answer the page renders above the fold and nothing else:
 * structured data whose answer a visitor cannot find on the page is a
 * violation, and a game page is not the place for a question list (#923).
 */
export function buildGameJsonLd(id: string): Record<string, unknown>[] {
  const { seo, path, name, minPlayers, maxPlayers, supportsBots } = resolveGame(id)
  const url = `${BASE}${path}`

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name,
      description: seo.schemaDescription,
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
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
        { '@type': 'ListItem', position: 2, name: 'Games', item: `${BASE}/games` },
        { '@type': 'ListItem', position: 3, name, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: englishText(seo.questionKey),
          acceptedAnswer: { '@type': 'Answer', text: englishText(seo.answerKey) },
        },
      ],
    },
  ]
}
