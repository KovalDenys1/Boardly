import type { Metadata } from 'next'
import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  // The game's own detail page since #1036, the way every other lobbies list
  // points at its parent. It is noindex itself until #873, which is why this
  // list stays noindex too.
  alternates: { canonical: 'https://boardly.online/games/sketch-and-guess' },
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
