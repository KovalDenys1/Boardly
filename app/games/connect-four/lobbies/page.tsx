import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/connect-four' },
}

export default function ConnectFourLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="connect_four"
      pagePath="/games/connect-four/lobbies"
      titleEmoji="🔴"
      gameNameKey="games.connect_four.name"
      lobbiesNamespace="games.connect_four.lobbies"
    />
  )
}
