import type { Metadata } from 'next'
import GameDetailPage from '../components/GameDetailPage'

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
    'Classic dice-rolling game where players compete to score the highest by filling 13 scoring categories across five dice rolls.',
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
      <GameDetailPage
        gameName="Yahtzee"
        title="Play Yahtzee Online"
        description="Roll five dice, choose your best scoring categories, and play a full game with friends or bots right in the browser."
        icon="🎲"
        iconLabel="Dice"
        accent="var(--bd-lav)"
        lobbiesHref="/games/yahtzee/lobbies"
        facts={[
          { label: 'Players', value: '1–4' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Bot support', value: 'Yes' },
        ]}
        introTitle="What is Yahtzee?"
        intro={[
          'Yahtzee is a classic dice game where players roll five dice and try to score in 13 different categories, from three-of-a-kind and full house to the big five-of-a-kind Yahtzee.',
          'On Boardly, you can play online with friends, add bots when you need extra players, or practice solo. Everything runs in the browser, so a shared link is enough to start.',
        ]}
        steps={[
          { title: 'Create or join a lobby', desc: 'Start a room from the lobby page or enter a code your friend shared.' },
          { title: 'Roll the dice', desc: 'Roll up to three times on your turn. Keep the dice you like and re-roll the rest.' },
          { title: 'Pick a score', desc: 'Choose one open scoring category after your roll. Each category can be used once.' },
          { title: 'Finish the scorecard', desc: 'When every category is filled, the player with the highest total wins.' },
        ]}
        benefitsTitle="Why play Yahtzee on Boardly?"
        benefits={[
          'Live multiplayer with turns updating for everyone.',
          'Bots are available when friends are offline.',
          'Works on phone, tablet, and desktop.',
          'Free to play as a guest.',
        ]}
      />
    </>
  )
}
