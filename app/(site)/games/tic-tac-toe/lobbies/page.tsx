import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/(site)/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/tic-tac-toe' },
}

export default function TicTacToeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="tic_tac_toe"
      accentColor="var(--bd-coral)"
      pagePath="/games/tic-tac-toe/lobbies"
      gameNameKey="games.tictactoe.name"
      lobbiesNamespace="games.tictactoe.lobbies"
    />
  )
}
