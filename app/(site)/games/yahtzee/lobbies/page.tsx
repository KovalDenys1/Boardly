import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/(site)/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/yahtzee' },
}

export default function YahtzeeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="yahtzee"
      gameId="yahtzee"
      accentColor="var(--bd-sky)"
      pagePath="/games/yahtzee/lobbies"
      gameNameKey="games.yahtzee.name"
      lobbiesNamespace="games.yahtzee.lobbies"
    />
  )
}
