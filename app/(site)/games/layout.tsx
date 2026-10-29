import type { Metadata } from 'next'
import { OG_SITE_DEFAULTS, socialImages } from '@/lib/social-preview'

export const metadata: Metadata = {
  title: 'Free Online Board Games - Play with Friends',
  description:
    'Browse and play free online multiplayer board games on Boardly. Yahtzee, Tic Tac Toe, Memory, Spy games and more. Real-time gameplay, no download, no account required.',
  keywords: [
    'free online board games',
    'multiplayer board games online',
    'online games with friends',
    'browser board games',
    'play board games online free',
    'real-time multiplayer games',
    'boardly games',
  ],
  openGraph: {
    ...OG_SITE_DEFAULTS,
    images: socialImages('games'),
    title: 'Free Online Board Games - Play with Friends | Boardly',
    description:
      'Yahtzee, Tic Tac Toe, Memory, Spy and more. Free real-time multiplayer games in your browser.',
    // No `url`: every page under /games that sets no openGraph of its own
    // (the /games/<slug>/lobbies lists) inherits this block, and a fixed
    // `url` told them all they were /games (#1091).
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    images: socialImages('games'),
    title: 'Free Online Board Games - Play with Friends | Boardly',
    description:
      'Yahtzee, Tic Tac Toe, Memory, Spy and more. Free real-time multiplayer games in your browser.',
  },
}

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
