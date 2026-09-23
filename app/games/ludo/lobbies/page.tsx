import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/ludo' },
}

export default function LudoLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="ludo"
      pagePath="/games/ludo/lobbies"
      gameNameKey="games.ludo.name"
      lobbiesNamespace="games.ludo.lobbies"
    />
  )
}
