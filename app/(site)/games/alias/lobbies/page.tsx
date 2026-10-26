import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/(site)/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/alias' },
}

export default function AliasLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="alias"
      pagePath="/games/alias/lobbies"
      gameId="alias"
      accentColor="var(--bd-coral)"
      gameNameKey="games.alias.name"
      lobbiesNamespace="games.alias.lobbies"
    />
  )
}
