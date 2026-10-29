import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/(site)/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://boardly.online/games/rock-paper-scissors' },
}

export default function RockPaperScissorsLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="rock_paper_scissors"
      gameId="rps"
      accentColor="var(--bd-lav)"
      pagePath="/games/rock-paper-scissors/lobbies"
      gameNameKey="games.rock_paper_scissors.name"
      lobbiesNamespace="games.rps.lobbies"
    />
  )
}
