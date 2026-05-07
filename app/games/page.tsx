import type { Metadata } from 'next'
import {
  isTelephoneDoodleEnabled,
  isSketchAndGuessEnabled,
  isFakeArtistEnabled,
} from '@/lib/feature-flags'
import { getCatalogGames } from '@/lib/game-catalog'
import GamesClient from './GamesClient'

export const metadata: Metadata = {
  title: 'All Free Online Board Games - Multiplayer | Boardly',
  description:
    'Browse all free online board games on Boardly. Play Yahtzee, Tic Tac Toe, Memory, Guess the Spy and more with friends in real time. No download, no account needed.',
  keywords: [
    'free online board games',
    'online board games catalog',
    'multiplayer browser games',
    'online games with friends',
    'free board games no download',
    'boardly games',
    'online party games',
    'board games in browser',
  ],
  openGraph: {
    title: 'All Free Online Board Games - Multiplayer | Boardly',
    description: 'Browse all free online board games on Boardly. Play with friends in real time. No download needed.',
    url: 'https://boardly.online/games',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'All Free Online Board Games | Boardly',
    description: 'Free multiplayer board games in your browser. No download, no account required.',
  },
  alternates: {
    canonical: 'https://boardly.online/games',
  },
}

export default function GamesPage() {
  const enabledExperimental: string[] = []

  if (isTelephoneDoodleEnabled()) enabledExperimental.push('telephone-doodle')
  if (isSketchAndGuessEnabled()) enabledExperimental.push('guess-my-drawing')
  if (isFakeArtistEnabled()) enabledExperimental.push('fake-artist')

  const games = getCatalogGames({ enabledExperimental })

  return <GamesClient games={games} />
}
