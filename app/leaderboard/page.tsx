import type { Metadata } from 'next'
import { parseLeaderboardSearchParams, type LeaderboardPage as LeaderboardRows } from '@/lib/leaderboard'
import { fetchLeaderboardPage } from '@/lib/server/leaderboard'
import { apiLogger } from '@/lib/logger'
import LeaderboardClient from './LeaderboardClient'
import { OG_SITE_DEFAULTS, socialImages } from '@/lib/social-preview'

export const metadata: Metadata = {
  title: 'Leaderboard - Top Players',
  description:
    'See the top-ranked Boardly players by win rate across Yahtzee, Tic Tac Toe, Memory, Guess the Spy and more. Filter by game and time period.',
  openGraph: {
    ...OG_SITE_DEFAULTS,
    images: socialImages('leaderboard'),
    title: 'Leaderboard - Top Players | Boardly',
    description: 'Top players ranked by win rate across all Boardly games.',
    url: 'https://boardly.online/leaderboard',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    images: socialImages('leaderboard'),
    title: 'Leaderboard - Top Players | Boardly',
    description: 'Top players ranked by win rate across all Boardly games.',
  },
  alternates: {
    canonical: 'https://boardly.online/leaderboard',
  },
}

// The top rows are rendered into the HTML so crawlers get real players
// instead of an empty client shell (#922); the query behind them is cached
// for 20 s in lib/server/leaderboard.ts, shared with /api/leaderboard. Filter
// changes stay on the client, which fetches /api/leaderboard exactly as before.
export const dynamic = 'force-dynamic'

const log = apiLogger('/leaderboard')

type SearchParams = Record<string, string | string[] | undefined>

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { period, gameType } = parseLeaderboardSearchParams(await searchParams)

  let initial: LeaderboardRows | null = null
  try {
    initial = await fetchLeaderboardPage({ gameType: gameType || undefined, period, page: 0 })
  } catch (err) {
    // The client hook fetches on mount when there is nothing to hydrate from,
    // so a failed server query degrades to the previous behaviour – but it is
    // still a server failure, so it is logged like the API route logs its own.
    log.error('Leaderboard SSR query failed', err as Error)
  }

  return <LeaderboardClient initial={initial} />
}
