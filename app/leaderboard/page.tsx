import type { Metadata } from 'next'
import { parseLeaderboardSearchParams, type LeaderboardPage as LeaderboardRows } from '@/lib/leaderboard'
import { fetchLeaderboardPage } from '@/lib/server/leaderboard'
import LeaderboardClient from './LeaderboardClient'

export const metadata: Metadata = {
  title: 'Leaderboard - Top Players',
  description:
    'See the top-ranked Boardly players by win rate across Yahtzee, Tic Tac Toe, Memory, Guess the Spy and more. Filter by game and time period.',
  openGraph: {
    title: 'Leaderboard - Top Players | Boardly',
    description: 'Top players ranked by win rate across all Boardly games.',
    url: 'https://boardly.online/leaderboard',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leaderboard - Top Players | Boardly',
    description: 'Top players ranked by win rate across all Boardly games.',
  },
  alternates: {
    canonical: 'https://boardly.online/leaderboard',
  },
}

// The top rows are queried per request so crawlers get real players in the
// HTML instead of an empty client shell (#922). Filter changes stay on the
// client, which fetches /api/leaderboard exactly as before.
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { period, gameType } = parseLeaderboardSearchParams(await searchParams)

  let initial: LeaderboardRows | null = null
  try {
    initial = await fetchLeaderboardPage({ gameType: gameType || undefined, period, page: 0 })
  } catch {
    // The client hook fetches on mount when there is nothing to hydrate from,
    // so a failed server query degrades to the previous behaviour.
  }

  return <LeaderboardClient initial={initial} />
}
