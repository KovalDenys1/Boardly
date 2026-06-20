import type { Metadata } from 'next'
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

export default function LeaderboardPage() {
  return <LeaderboardClient />
}
