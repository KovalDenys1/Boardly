import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/(site)/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/memory' },
}

export default function MemoryLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="memory"
      gameId="memory"
      accentColor="var(--bd-mint)"
      pagePath="/games/memory/lobbies"
      gameNameKey="games.memory.name"
      lobbiesNamespace="games.memory.lobbies"
    />
  )
}
