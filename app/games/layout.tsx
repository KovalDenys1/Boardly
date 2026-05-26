import type { Metadata } from 'next'

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
    title: 'Free Online Board Games - Play with Friends | Boardly',
    description:
      'Yahtzee, Tic Tac Toe, Memory, Spy and more. Free real-time multiplayer games in your browser.',
    url: 'https://boardly.online/games',
    type: 'website',
  },
}

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
