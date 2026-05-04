import type { Metadata } from 'next'
import YahtzeeDetailContent from './YahtzeeDetailContent'

export const metadata: Metadata = {
  title: 'Play Yahtzee Online Free - Multiplayer Dice Game',
  description:
    'Play Yahtzee online with friends for free! Roll dice, fill scoring categories, and compete in real-time multiplayer. No download needed. 1–4 players. Start playing instantly on Boardly!',
  keywords: [
    'play yahtzee online',
    'yahtzee online free',
    'yahtzee multiplayer',
    'online yahtzee with friends',
    'dice game online',
    'free yahtzee game',
    'yahtzee browser game',
    'real-time yahtzee',
  ],
  openGraph: {
    title: 'Play Yahtzee Online Free - Multiplayer Dice Game | Boardly',
    description:
      'Roll dice, score combinations, and beat your friends in real-time Yahtzee. Free, no download, 1–4 players.',
    url: 'https://boardly.online/games/yahtzee',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Yahtzee Online Free | Boardly',
    description: 'Real-time multiplayer Yahtzee in your browser. Free, no download required.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/yahtzee',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Yahtzee', item: 'https://boardly.online/games/yahtzee' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Yahtzee',
  description:
    'Classic dice-rolling game where players compete to score the highest by filling 15 scoring categories across five dice rolls.',
  url: 'https://boardly.online/games/yahtzee',
  image: 'https://boardly.online/opengraph-image',
  genre: ['Dice Game', 'Strategy', 'Multiplayer'],
  numberOfPlayers: {
    '@type': 'QuantitativeValue',
    minValue: 1,
    maxValue: 4,
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

export default function YahtzeePage() {
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
      <YahtzeeDetailContent />
    </>
  )
}
