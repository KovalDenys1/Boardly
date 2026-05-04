import type { Metadata } from 'next'
import TicTacToeDetailContent from './TicTacToeDetailContent'

export const metadata: Metadata = {
  title: 'Play Tic Tac Toe Online Free - Multiplayer',
  description:
    'Play Tic Tac Toe online with friends for free! Real-time 2-player matches, AI opponents, and match mode. No download, no account needed. Start playing instantly on Boardly!',
  keywords: [
    'tic tac toe online',
    'tic tac toe multiplayer',
    'play tic tac toe with friends',
    'tic tac toe online free',
    'noughts and crosses online',
    'xs and os game online',
    'tic tac toe browser game',
    'free tic tac toe game',
  ],
  openGraph: {
    title: 'Play Tic Tac Toe Online Free - Multiplayer | Boardly',
    description:
      'Challenge friends or AI in real-time Tic Tac Toe. Free, no download, 2 players. Start a match instantly!',
    url: 'https://boardly.online/games/tic-tac-toe',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Tic Tac Toe Online Free | Boardly',
    description: 'Real-time multiplayer Tic Tac Toe in your browser. Free, no account needed.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/tic-tac-toe',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Tic Tac Toe', item: 'https://boardly.online/games/tic-tac-toe' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Tic Tac Toe',
  description:
    'Classic 3×3 grid strategy game where two players alternate placing X and O marks, aiming to get three in a row.',
  url: 'https://boardly.online/games/tic-tac-toe',
  image: 'https://boardly.online/opengraph-image',
  genre: ['Strategy', 'Puzzle', 'Multiplayer'],
  numberOfPlayers: {
    '@type': 'QuantitativeValue',
    minValue: 2,
    maxValue: 2,
  },
  playMode: ['MultiPlayer', 'SinglePlayer'],
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Boardly',
    url: 'https://boardly.online',
  },
}

export default function TicTacToePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <TicTacToeDetailContent />
    </>
  )
}
