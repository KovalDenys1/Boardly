import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/(site)/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/liars-party' },
}

export default function LiarsPartyLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="liars_party"
      pagePath="/games/liars-party/lobbies"
      gameNameKey="games.liars_party.name"
      lobbiesNamespace="games.liars_party.lobbies"
    />
  )
}
