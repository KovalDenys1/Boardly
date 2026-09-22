/**
 * Single source of truth for the SEO guide pages under /guides.
 * Used by the guides index, the sitemap, and the "Guides" section that links
 * every guide from `/` and `/games` (the only two pages Google crawls today).
 * Guide content is English-only, so titles/descriptions are deliberately not
 * routed through i18n – they mirror the page <title>s.
 */

import type { IconName } from '@/components/icons/names'
import { getCatalogEntryById } from '@/lib/game-catalog'

export type GuideCategory = 'how-to-play' | 'strategy' | 'best-of'

/** A game glyph (catalog id) or a chrome icon, drawn in the guide's accent. */
export type GuideIcon = { game: string } | { glyph: IconName }

export interface GuideEntry {
  slug: string
  title: string
  description: string
  icon: GuideIcon
  readTime: string
  accent: string
  category: GuideCategory
  /**
   * The catalog id of the game this guide teaches, when it teaches one. It is
   * what points the guide at `/games/<slug>` and the game page back at every
   * guide about it, so neither side hand-types the other's URL. A best-of list
   * covers several games and leaves it unset.
   */
  game?: string
  /** Last content change (YYYY-MM-DD) – drives sitemap lastModified. */
  updated: string
}

export const HOW_TO_PLAY_GUIDES: GuideEntry[] = [
  {
    slug: 'how-to-play-yahtzee-online',
    title: 'How to Play Yahtzee Online',
    description: 'Scoring categories, strategy tips, and how to set up a multiplayer game.',
    icon: { game: 'yahtzee' },
    readTime: '5 min',
    accent: 'var(--bd-sky)',
    category: 'how-to-play',
    game: 'yahtzee',
    updated: '2026-09-22',
  },
  {
    slug: 'how-to-play-spy-game-online',
    title: 'How to Play Guess the Spy',
    description: 'Tips for finding the spy, bluffing, and running a great game night.',
    icon: { game: 'spy' },
    readTime: '4 min',
    accent: 'var(--bd-lav)',
    category: 'how-to-play',
    game: 'spy',
    updated: '2026-09-22',
  },
  {
    slug: 'how-to-play-memory-card-game-online',
    title: 'How to Play Memory Card Game',
    description: 'Rules, difficulty levels, and strategy for the classic matching game.',
    icon: { game: 'memory' },
    readTime: '4 min',
    accent: 'var(--bd-mint)',
    category: 'how-to-play',
    game: 'memory',
    updated: '2026-09-22',
  },
  {
    slug: 'how-to-play-tic-tac-toe-online',
    title: 'How to Play Tic Tac Toe Online',
    description: 'All 8 winning lines and the strategy to never lose.',
    icon: { game: 'tic-tac-toe' },
    readTime: '4 min',
    accent: 'var(--bd-coral)',
    category: 'how-to-play',
    game: 'tic-tac-toe',
    updated: '2026-09-22',
  },
  {
    slug: 'how-to-play-connect-four-online',
    title: 'How to Play Connect Four Online',
    description: 'Drop discs, get four in a row, beat your opponent. Rules and winning tips.',
    icon: { game: 'connect-four' },
    readTime: '3 min',
    accent: 'var(--bd-sun)',
    category: 'how-to-play',
    game: 'connect-four',
    updated: '2026-09-22',
  },
  {
    slug: 'how-to-play-rock-paper-scissors-online',
    title: 'How to Play Rock Paper Scissors Online',
    description: 'The best-of-three format, how to read an opponent, and how the bot picks its move.',
    icon: { game: 'rps' },
    readTime: '6 min',
    accent: 'var(--bd-lav)',
    category: 'how-to-play',
    game: 'rps',
    updated: '2026-09-20',
  },
  {
    slug: 'how-to-play-alias-online',
    title: 'How to Play Alias Online',
    description: 'Describe words, help your team guess, and score more than the other team.',
    icon: { game: 'alias' },
    readTime: '4 min',
    accent: 'var(--bd-coral)',
    category: 'how-to-play',
    game: 'alias',
    updated: '2026-09-15',
  },
]

export const STRATEGY_GUIDES: GuideEntry[] = [
  {
    slug: 'yahtzee-strategy-guide',
    title: 'Yahtzee Strategy Guide — How to Win More Often',
    description: 'When to go for Yahtzee, how to chase the bonus, and which categories to fill first.',
    icon: { glyph: 'trophy' },
    readTime: '6 min',
    accent: 'var(--bd-sky)',
    category: 'strategy',
    game: 'yahtzee',
    updated: '2026-09-22',
  },
  {
    slug: 'connect-four-strategy-guide',
    title: 'Connect Four Strategy Guide — How to Win Every Time',
    description: 'Center control, double threats, and the key traps that catch most players off guard.',
    icon: { game: 'connect-four' },
    readTime: '5 min',
    accent: 'var(--bd-sun)',
    category: 'strategy',
    game: 'connect-four',
    updated: '2026-09-22',
  },
]

export const BEST_OF_GUIDES: GuideEntry[] = [
  {
    slug: 'best-2-player-games-online',
    title: 'Best 2 Player Games Online — Free, No Download',
    description: 'Tic Tac Toe, Memory, Yahtzee and more for playing with one friend.',
    icon: { glyph: 'users' },
    readTime: '4 min',
    accent: 'var(--bd-sun)',
    category: 'best-of',
    updated: '2026-09-18',
  },
  {
    slug: 'best-online-games-for-game-night',
    title: 'Best Online Games for Game Night',
    description: 'Five games that work for any group size — with tips for hosting online.',
    icon: { glyph: 'party' },
    readTime: '5 min',
    accent: 'var(--bd-lav)',
    category: 'best-of',
    updated: '2026-09-18',
  },
  {
    slug: 'best-games-to-play-on-zoom',
    title: 'Best Games to Play on Zoom — Free, No Download',
    description: 'Browser games that work perfectly alongside any video call. No screen sharing needed.',
    icon: { glyph: 'laptop' },
    readTime: '4 min',
    accent: 'var(--bd-sky)',
    category: 'best-of',
    updated: '2026-09-15',
  },
]

export const ALL_GUIDES: GuideEntry[] = [...HOW_TO_PLAY_GUIDES, ...STRATEGY_GUIDES, ...BEST_OF_GUIDES]
/** The catalog entry for a guide page – its Article.dateModified must be `updated` from here, not hand-typed. */
export function getGuideBySlug(slug: string): GuideEntry {
  const guide = ALL_GUIDES.find((entry) => entry.slug === slug)
  if (!guide) throw new Error(`Guide "${slug}" is not in ALL_GUIDES`)
  return guide
}

/**
 * `/games/<slug>` for the game a guide teaches – the detail page, not the
 * lobbies list under it, derived from the catalog route the same way
 * `lib/game-seo.ts` derives the canonical. Null for a guide with no `game`.
 * A `game` that names nothing in the catalog is a typo, and the guides
 * prerender at build time, so it fails the build rather than ship a dead link.
 */
export function getGuideGamePath(guide: GuideEntry): string | null {
  if (!guide.game) return null
  const entry = getCatalogEntryById(guide.game)
  if (!entry) throw new Error(`Guide "${guide.slug}" names catalog game "${guide.game}", which does not exist`)
  if (!('route' in entry) || !entry.route) throw new Error(`Guide "${guide.slug}" names "${guide.game}", which has no route`)
  return entry.route.replace(/\/lobbies$/, '')
}

/** Every guide about one catalog game, how-to first, then strategy – the order the game page lists them in. */
export function getGuidesForGame(gameId: string): GuideEntry[] {
  return ALL_GUIDES.filter((guide) => guide.game === gameId)
}

