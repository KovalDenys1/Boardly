import en from '../locales/en'
import { getCatalogGames, getGameMetadata, hasBotSupport } from './game-catalog'
import { ALL_GUIDES, type GuideCategory } from './guides-catalog'

/**
 * Link previews for every public page (#1091).
 *
 * A page that sets its own `openGraph` replaces the root layout's object, and the
 * root `opengraph-image.tsx` goes with it: until this file existed only `/` carried
 * an `og:image`, so a shared game or guide link rendered as a bare text card in
 * WhatsApp, Discord, Messenger and X. Every page's head now names its card
 * explicitly through `socialImages()`, and the card itself is drawn by
 * `app/og/[key]/route.tsx` from the entry below.
 *
 * The cards are keyed, never parameterised by free text: a route that rendered
 * whatever `?title=` it was given would let anyone mint a Boardly-branded image
 * saying anything.
 *
 * Images live under `/og/`, not `/api/`, because robots.txt disallows `/api/` and
 * Twitterbot honours robots.txt for the image as well as the page.
 */

export const SOCIAL_IMAGE_WIDTH = 1200
export const SOCIAL_IMAGE_HEIGHT = 630

/**
 * What a page-level `openGraph` loses when it replaces the root one. Spread it
 * first so the page's own fields win. `alternateLocale` is left for #928, which
 * owns the localized URLs it would describe.
 */
export const OG_SITE_DEFAULTS = {
  siteName: 'Boardly',
  locale: 'en_US',
} as const

/** Hex values of the design tokens, because the image renderer has no CSS variables. */
const TOKEN_HEX: Record<string, string> = {
  'var(--bd-sky)': '#6BC1F0',
  'var(--bd-lav)': '#9B8CFF',
  'var(--bd-coral)': '#FF6B5B',
  'var(--bd-sun)': '#FFC44D',
  'var(--bd-mint)': '#4FC9A6',
}
const DEFAULT_ACCENT = '#FF6B5B'

export function accentHex(token: string | undefined): string {
  return (token && TOKEN_HEX[token]) || DEFAULT_ACCENT
}

export type SocialCard = {
  /** Small line above the title. */
  eyebrow: string
  title: string
  subtitle: string
  /** Hex colour. */
  accent: string
  /** Up to four short labels along the bottom. */
  chips: string[]
  /** Alt text for the image, also used as `og:image:alt`. */
  alt: string
}

const STATIC_CARDS: Record<string, SocialCard> = {
  games: {
    eyebrow: 'Free online board games',
    title: 'Pick a game, send a link, play',
    subtitle: 'Real-time multiplayer board games in your browser. No download, no signup.',
    accent: '#FF6B5B',
    chips: ['Yahtzee', 'Guess the Spy', 'Connect Four', 'Tic-Tac-Toe'],
    alt: 'All free online board games on Boardly',
  },
  guides: {
    eyebrow: 'Boardly guides',
    title: 'Rules, strategy and game-night picks',
    subtitle: 'Step-by-step guides for playing board games online with friends.',
    accent: '#FFC44D',
    chips: ['How to play', 'Strategy', 'Best of'],
    alt: 'Board game guides and tips on Boardly',
  },
  about: {
    eyebrow: 'About Boardly',
    title: 'Board games with friends, in the browser',
    subtitle: 'A free real-time multiplayer board games site. Share a link, everyone joins, no signup.',
    accent: '#9B8CFF',
    chips: ['Free', 'Real time', 'No download'],
    alt: 'About Boardly',
  },
  premium: {
    eyebrow: 'Boardly Premium',
    title: 'Make your table yours',
    subtitle: 'Custom avatars, a gold name, lobby themes and more. Every game stays free.',
    accent: '#FFC44D',
    chips: ['Custom avatar', 'Gold name', 'Lobby themes'],
    alt: 'Boardly Premium',
  },
  leaderboard: {
    eyebrow: 'Boardly leaderboard',
    title: 'Top players across every game',
    subtitle: 'Ranked by win rate across all Boardly games.',
    accent: '#4FC9A6',
    chips: ['Win rate', 'All games'],
    alt: 'Boardly leaderboard – top players',
  },
}

const GUIDE_EYEBROW: Record<GuideCategory, string> = {
  'how-to-play': 'How to play',
  strategy: 'Strategy guide',
  'best-of': 'Game night picks',
}

/** The English one-liner the game ribbon shows; the card has no room for the meta description. */
function englishLine(key: string): string | null {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  return typeof value === 'string' ? value : null
}

function gameCards(): Record<string, SocialCard> {
  const cards: Record<string, SocialCard> = {}
  for (const entry of getCatalogGames()) {
    if (!entry.seo || !entry.route || !entry.gameType) continue
    const meta = getGameMetadata(entry.gameType)
    if (!meta) continue
    const bots = hasBotSupport(entry.gameType)
    cards[`game-${entry.id}`] = {
      eyebrow: 'Play free on Boardly',
      title: meta.name,
      subtitle: englishLine(entry.descriptionKey) ?? entry.seo.description,
      accent: accentHex(meta.accentColor),
      chips: [`${entry.players.replace('-', '–')} players`, 'No signup', ...(bots ? ['Friends or bots'] : ['With friends'])],
      alt: `Play ${meta.name} online free on Boardly`,
    }
  }
  return cards
}

function guideCards(): Record<string, SocialCard> {
  const cards: Record<string, SocialCard> = {}
  for (const guide of ALL_GUIDES) {
    cards[`guide-${guide.slug}`] = {
      eyebrow: GUIDE_EYEBROW[guide.category],
      title: guide.title,
      subtitle: guide.description,
      accent: accentHex(guide.accent),
      chips: [guide.readTime, 'Free guide'],
      alt: guide.title,
    }
  }
  return cards
}

let registry: Record<string, SocialCard> | null = null

function getRegistry(): Record<string, SocialCard> {
  registry ??= { ...STATIC_CARDS, ...gameCards(), ...guideCards() }
  return registry
}

export function getSocialCard(key: string): SocialCard | null {
  return getRegistry()[key] ?? null
}

export function getSocialCardKeys(): string[] {
  return Object.keys(getRegistry())
}

/** The card key for a `/games/<slug>` page, from its catalog id. */
export function gameSocialCardKey(catalogId: string): string {
  return `game-${catalogId}`
}

/** The card key for a `/guides/<slug>` page. */
export function guideSocialCardKey(slug: string): string {
  return `guide-${slug}`
}

export type SocialImage = {
  url: string
  width: number
  height: number
  alt: string
  type: 'image/png'
}

/**
 * The `images` array for both `openGraph` and `twitter`. The URL is relative and
 * resolved against the root layout's `metadataBase`, so the tag is absolute.
 * Throws on an unknown key so a typo fails the build instead of shipping a 404.
 */
export function socialImages(key: string): SocialImage[] {
  const card = getSocialCard(key)
  if (!card) throw new Error(`No social card "${key}"`)
  return [
    {
      url: `/og/${key}`,
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      alt: card.alt,
      type: 'image/png',
    },
  ]
}
