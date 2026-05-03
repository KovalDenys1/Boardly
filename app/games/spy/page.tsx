import type { Metadata } from 'next'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = {
  title: 'Play Guess the Spy Online Free - Social Deduction Game',
  description:
    'Play Guess the Spy online with friends for free! 3–10 players, real-time social deduction. One player is the spy — can they hide it? No download needed. Start on Boardly now!',
  keywords: [
    'spy game online',
    'guess the spy online',
    'spyfall online free',
    'social deduction game online',
    'who is the spy game',
    'spy party game online',
    'online spy game with friends',
    'deduction game browser',
  ],
  openGraph: {
    title: 'Play Guess the Spy Online Free - Social Deduction | Boardly',
    description:
      'One player is the spy with no clue of the location. Can they bluff their way through questioning? Free, 3–10 players, real-time.',
    url: 'https://boardly.online/games/spy',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Guess the Spy Online Free | Boardly',
    description: 'Real-time social deduction game in your browser. Find the spy — or be the spy. Free, no download.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/spy',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Guess the Spy', item: 'https://boardly.online/games/spy' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Guess the Spy',
  description:
    'Social deduction party game where most players share a secret location while one player — the spy — tries to blend in without knowing where they are.',
  url: 'https://boardly.online/games/spy',
  image: 'https://boardly.online/opengraph-image',
  genre: ['Social Deduction', 'Party Game', 'Multiplayer'],
  numberOfPlayers: {
    '@type': 'QuantitativeValue',
    minValue: 3,
    maxValue: 10,
  },
  playMode: 'MultiPlayer',
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

export default function SpyPage() {
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
        gameName="Guess the Spy"
        title="Play Guess the Spy Online"
        description="A party game about questions, bluffing, and one hidden spy trying to blend in before the group finds them."
        icon="🕵️"
        iconLabel="Spy"
        accent="var(--bd-coral)"
        lobbiesHref="/games/spy/lobbies"
        facts={[
          { label: 'Players', value: '3–10' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Game type', value: 'Party' },
        ]}
        introTitle="What is Guess the Spy?"
        intro={[
          'At the start of each round, most players receive the same secret location. One player is the spy: they know they are the spy, but they do not know the location.',
          'Players ask each other questions and listen for answers that feel suspicious. The group tries to expose the spy, while the spy tries to guess the location or survive the round.',
        ]}
        steps={[
          { title: 'Create a lobby', desc: 'Start a room and invite your group with a code or link.' },
          { title: 'Get your role', desc: 'Most players see the location. The spy only sees that they are the spy.' },
          { title: 'Ask smart questions', desc: 'Take turns asking questions that reveal clues without giving the location away.' },
          { title: 'Vote or guess', desc: 'The group can vote for the spy, and the spy can try to name the location.' },
        ]}
        benefitsTitle="Why play Guess the Spy on Boardly?"
        benefits={[
          'Easy to start with a shared room link.',
          'Great for groups, parties, and quick breaks.',
          'Works from any modern browser.',
          'Free to play as a guest.',
        ]}
      />
    </>
  )
}
