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
  /**
   * When the guide first went live (YYYY-MM-DD), from `git log --diff-filter=A`.
   * Article.datePublished, and four guides carried a `2025-01-01` placeholder
   * before this field existed – a date that predates the site.
   */
  published: string
  /** Everything `lib/guide-seo.ts` needs to build the page's head. */
  seo: GuideSeo
}

/**
 * The copy in a guide's `<head>`: the page title (which differs from the card
 * `title` the index shows), the meta description, the OG and Article variants,
 * and the breadcrumb's own label. Twelve pages hand-wrote all of this, and none
 * of the twelve carried a Twitter card.
 */
export interface GuideSeo {
  /** The <title>, without a suffix – `lib/guide-seo.ts` adds " | Boardly". */
  title: string
  description: string
  keywords: string[]
  /** The og:title, shorter than the page title; " | Boardly" is appended. */
  ogTitle: string
  ogDescription: string
  /** Article.headline – the guide's name as a sentence, em dash and all. */
  headline: string
  /** Article.description, one line. */
  articleDescription: string
  /** The last breadcrumb crumb, which is usually shorter than the page title. */
  breadcrumbLabel: string
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
    published: '2026-03-25',
    seo: {
      title: 'How to Play Yahtzee Online with Friends - Complete Guide',
      description:
        'Learn how to play Yahtzee online step by step. Scoring categories explained, strategy tips for beginners and veterans, and how to start a multiplayer game instantly.',
      keywords: [
        'how to play yahtzee online',
        'yahtzee rules',
        'yahtzee scoring categories',
        'yahtzee strategy',
        'play yahtzee with friends online',
        'yahtzee multiplayer guide',
        'yahtzee for beginners',
      ],
      ogTitle: 'How to Play Yahtzee Online with Friends',
      ogDescription: 'Complete Yahtzee guide — rules, scoring categories, strategy tips. Free multiplayer in your browser.',
      headline: 'How to Play Yahtzee Online with Friends — Complete Guide',
      articleDescription: 'Step-by-step guide to playing Yahtzee online — rules, scoring, and strategy tips.',
      breadcrumbLabel: 'How to Play Yahtzee Online',
    },
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
    published: '2026-03-25',
    seo: {
      title: 'How to Play Guess the Spy Online - Complete Guide',
      description:
        'Learn how to play Guess the Spy online. Rules, tips for finding the spy, how to survive as the spy, and how to run a great game night.',
      keywords: [
        'how to play guess the spy online',
        'spy game rules',
        'social deduction game guide',
        'spy game strategy',
        'play guess the spy with friends',
        'spy game tips',
      ],
      ogTitle: 'How to Play Guess the Spy Online',
      ogDescription: 'Complete Guess the Spy guide — rules, tips for innocents and the spy. Free 3–10 player game in your browser.',
      headline: 'How to Play Guess the Spy Online — Complete Guide',
      articleDescription: 'Rules, tips for finding the spy, and survival tips as the spy.',
      breadcrumbLabel: 'How to Play Guess the Spy',
    },
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
    published: '2026-05-07',
    seo: {
      title: 'How to Play Memory Card Game Online - Complete Guide',
      description:
        'Rules, difficulty levels, and strategy tips for the classic card-matching game. Free multiplayer in your browser.',
      keywords: [
        'how to play memory card game online',
        'memory game rules',
        'concentration card game guide',
        'memory game strategy',
        'play memory with friends online',
      ],
      ogTitle: 'How to Play Memory Card Game Online',
      ogDescription: 'Complete Memory guide — rules, difficulty levels, strategy tips. Free 2–4 player game in your browser.',
      headline: 'How to Play Memory Card Game Online — Complete Guide',
      articleDescription: 'Rules, difficulty levels, and strategy tips for Memory.',
      breadcrumbLabel: 'How to Play Memory Card Game',
    },
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
    published: '2026-05-07',
    seo: {
      title: 'How to Play Tic Tac Toe Online - Complete Guide',
      description:
        'Complete Tic Tac Toe guide — rules, all 8 winning lines, and strategies to never lose. Free vs AI or 2 players.',
      keywords: [
        'how to play tic tac toe online',
        'tic tac toe rules',
        'noughts and crosses guide',
        'tic tac toe strategy',
        'play tic tac toe with friends',
      ],
      ogTitle: 'How to Play Tic Tac Toe Online',
      ogDescription: 'Complete Tic Tac Toe guide — rules, winning lines, and never-lose strategy. Free vs AI or 2 players.',
      headline: 'How to Play Tic Tac Toe Online — Complete Guide',
      articleDescription: 'Rules, winning lines, and strategy for Tic Tac Toe.',
      breadcrumbLabel: 'How to Play Tic Tac Toe Online',
    },
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
    published: '2026-05-26',
    seo: {
      title: 'How to Play Connect Four Online - Complete Guide',
      description:
        'Learn how to play Connect Four online. Simple rules, winning patterns, and tips to beat your opponent every time. Free 2-player game in your browser.',
      keywords: [
        'how to play connect four online',
        'connect four rules',
        'connect four strategy',
        'play connect four with friends',
        'connect four online free',
      ],
      ogTitle: 'How to Play Connect Four Online',
      ogDescription: 'Complete Connect Four guide — rules, winning patterns, and strategy tips. Free 2-player game in your browser.',
      headline: 'How to Play Connect Four Online — Complete Guide',
      articleDescription: 'Rules, winning patterns, and strategy for Connect Four.',
      breadcrumbLabel: 'How to Play Connect Four Online',
    },
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
    published: '2026-09-20',
    seo: {
      title: 'How to Play Rock Paper Scissors Online - Complete Guide',
      description:
        'Learn how to play Rock Paper Scissors online. Rules, the best-of-three format, how to read an opponent, and how to beat the bot. Free 2-player game in your browser.',
      keywords: [
        'how to play rock paper scissors online',
        'rock paper scissors rules',
        'rock paper scissors strategy',
        'play rock paper scissors with friends',
        'rock paper scissors online free',
      ],
      ogTitle: 'How to Play Rock Paper Scissors Online',
      ogDescription: 'Complete Rock Paper Scissors guide – rules, the best-of-three format, and strategy that actually works. Free 2-player game in your browser.',
      headline: 'How to Play Rock Paper Scissors Online – Complete Guide',
      articleDescription: 'Rules, the best-of-three format, and strategy for Rock Paper Scissors.',
      breadcrumbLabel: 'How to Play Rock Paper Scissors Online',
    },
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
    published: '2026-05-26',
    seo: {
      title: 'How to Play Alias Online - Complete Guide',
      description:
        'Learn how to play Alias online with friends. Rules, how to describe words, team tips, and how to win. Free multiplayer word game in your browser.',
      keywords: [
        'how to play alias online',
        'alias game rules',
        'alias word game guide',
        'alias game tips',
        'play alias with friends online',
        'alias online free',
      ],
      ogTitle: 'How to Play Alias Online',
      ogDescription: 'Complete Alias guide — rules, how to describe words well, and tips to help your team win. Free multiplayer in your browser.',
      headline: 'How to Play Alias Online — Complete Guide',
      articleDescription: 'Rules, tips for describing words, and how to win at Alias.',
      breadcrumbLabel: 'How to Play Alias Online',
    },
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
    published: '2026-05-26',
    seo: {
      title: 'Yahtzee Strategy Guide — How to Win More Often',
      description:
        'Proven Yahtzee strategies to boost your score every game. Learn when to go for Yahtzee, how to chase the bonus, and which categories to fill first.',
      keywords: [
        'yahtzee strategy',
        'how to win at yahtzee',
        'yahtzee tips',
        'yahtzee scoring strategy',
        'best yahtzee strategy',
        'yahtzee category order',
      ],
      ogTitle: 'Yahtzee Strategy Guide',
      ogDescription: 'Proven Yahtzee strategies — when to go for Yahtzee, how to chase the bonus, and which categories to fill first.',
      headline: 'Yahtzee Strategy Guide — How to Win More Often',
      articleDescription: 'Proven Yahtzee strategies: upper section bonus, category order, when to go for Yahtzee.',
      breadcrumbLabel: 'Yahtzee Strategy Guide',
    },
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
    published: '2026-05-26',
    seo: {
      title: 'Connect Four Strategy Guide — How to Win Every Time',
      description:
        'Proven Connect Four strategies to beat any opponent. Learn center control, how to set up unstoppable threats, and the key traps that catch most players off guard.',
      keywords: [
        'connect four strategy',
        'how to win connect four',
        'connect four tips',
        'connect four winning strategy',
        'connect four tricks',
        'best connect four moves',
      ],
      ogTitle: 'Connect Four Strategy Guide',
      ogDescription: 'Proven Connect Four strategies — center control, double threats, and the traps that win games.',
      headline: 'Connect Four Strategy Guide — How to Win Every Time',
      articleDescription: 'Center control, double threats, and key traps in Connect Four.',
      breadcrumbLabel: 'Connect Four Strategy Guide',
    },
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
    published: '2026-05-08',
    seo: {
      title: 'Best 2 Player Games Online Free - No Download',
      description:
        'The best free 2 player games you can play online right now. Tic Tac Toe, Memory, and more — no download, no account required. Play with a friend in seconds.',
      keywords: [
        'best 2 player games online',
        '2 player games online free',
        'two player games online no download',
        'online games for 2 players',
        'free 2 player browser games',
        '2 player board games online',
        'play games with one friend online',
        'two player games free',
      ],
      ogTitle: 'Best 2 Player Games Online Free',
      ogDescription: 'Top free 2 player games you can play in your browser right now — no download, no account needed.',
      headline: 'Best 2 Player Games Online Free — No Download Required',
      articleDescription: 'A curated list of the best free 2 player games you can play in any browser instantly.',
      breadcrumbLabel: 'Best 2 Player Games Online',
    },
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
    published: '2026-05-26',
    seo: {
      title: 'Best Online Games for Game Night — Free, No Download',
      description:
        'The best games to play online with friends on game night, from three players to a full party. No app, no setup – share a link and start playing. Free browser games for groups of 2–10.',
      keywords: [
        'best online games for game night',
        'game night games online',
        'online game night ideas',
        'virtual game night games free',
        'online games to play with friends at home',
        'best multiplayer games for game night',
        'best party games online',
        'online party games free',
        'best 3 player games online',
        'online games for 3 players',
      ],
      ogTitle: 'Best Online Games for Game Night',
      ogDescription: 'Top free browser games for your next online game night — no download, no account needed.',
      headline: 'Best Online Games for Game Night — Free, No Download',
      articleDescription: 'Top free browser games for online game nights with friends.',
      breadcrumbLabel: 'Best Online Games for Game Night',
    },
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
    published: '2026-05-26',
    seo: {
      title: 'Best Games to Play on Zoom — Free, No Download',
      description:
        'The best free browser games to play while on a Zoom call. No app needed — just share the link in chat and everyone joins instantly. Works with any video call.',
      keywords: [
        'best games to play on zoom',
        'zoom games free',
        'games to play on video call',
        'online games for zoom calls',
        'zoom game night ideas',
        'free games to play on video call with friends',
        'games to play while on facetime',
      ],
      ogTitle: 'Best Games to Play on Zoom',
      ogDescription: 'Free browser games that work perfectly on Zoom — share a link in chat and play together instantly.',
      headline: 'Best Games to Play on Zoom — Free, No Download',
      articleDescription: 'Free browser games that work perfectly alongside any video call.',
      breadcrumbLabel: 'Best Games to Play on Zoom',
    },
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

