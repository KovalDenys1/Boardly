import type { Metadata } from 'next'
import ConnectFourDetailContent from './ConnectFourDetailContent'

export const metadata: Metadata = {
  title: 'Play Connect Four Online Free - Multiplayer',
  description:
    'Play Connect Four online with friends for free! Real-time 2-player matches, AI opponents, and instant rematches. No download, no account needed. Start playing instantly on Boardly!',
  keywords: [
    'connect four online',
    'connect four multiplayer',
    'play connect four with friends',
    'connect four online free',
    'four in a row online',
    'connect 4 online',
    'connect four browser game',
    'free connect four game',
  ],
  openGraph: {
    title: 'Play Connect Four Online Free - Multiplayer | Boardly',
    description:
      'Challenge friends or AI in real-time Connect Four. Free, no download, 2 players. Start a match instantly!',
    url: 'https://boardly.online/games/connect-four',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Connect Four Online Free | Boardly',
    description: 'Real-time multiplayer Connect Four in your browser. Free, no account needed.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/connect-four',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Connect Four', item: 'https://boardly.online/games/connect-four' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Connect Four',
  description:
    'Two-player strategy game on a 6×7 grid. Drop coloured discs and be the first to connect four in a row — horizontally, vertically, or diagonally.',
  url: 'https://boardly.online/games/connect-four',
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

export default function ConnectFourPage() {
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
      <ConnectFourDetailContent />
    </>
  )
}
