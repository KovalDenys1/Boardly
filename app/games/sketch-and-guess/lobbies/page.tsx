import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  // No /games/sketch-and-guess detail page exists yet, so the catalog is the nearest indexable parent.
  alternates: { canonical: 'https://boardly.online/games' },
}

export default function SketchAndGuessLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="sketch_and_guess"
      gameId="guess-my-drawing"
      accentColor="var(--bd-mint)"
      pagePath="/games/sketch-and-guess/lobbies"
      gameNameKey="games.guess_my_drawing.name"
      lobbiesNamespace="games.guess_my_drawing.lobbies"
    />
  )
}
