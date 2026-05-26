import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/tic-tac-toe' },
}

export default function TicTacToeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="tic_tac_toe"
      iconVariant="tic-tac-toe"
      accentColor="var(--bd-coral)"
      pagePath="/games/tic-tac-toe/lobbies"
      titleEmoji="❌"
      gameNameKey="games.tictactoe.name"
      lobbiesNamespace="games.tictactoe.lobbies"
    />
  )
}
