import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/checkers' },
}

export default function CheckersLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="checkers"
      pagePath="/games/checkers/lobbies"
      gameNameKey="games.checkers.name"
      lobbiesNamespace="games.checkers.lobbies"
    />
  )
}
