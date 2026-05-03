import type { Metadata } from 'next'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = {
  title: 'Alias Coming Soon - Word Description Team Game',
  description:
    'Play Alias online with friends for free! 4–16 players, real-time word guessing. Describe words to your team against the clock — no download needed. Start on Boardly now!',
  keywords: [
    'alias game online',
    'alias word game',
    'word description game online',
    'team word game online free',
    'describe words game',
    'alias party game online',
    'online word guessing game',
    'alias browser game',
  ],
  openGraph: {
    title: 'Alias Coming Soon - Team Word Game | Boardly',
    description:
      'Describe words to your team without saying the word itself. Race against the clock, earn points, and outlast the other team. Free, 4–16 players.',
    url: 'https://boardly.online/games/alias',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alias Coming Soon | Boardly',
    description: 'Real-time team word game in your browser. Describe, guess, and score. Free, no download.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/alias',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Alias', item: 'https://boardly.online/games/alias' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Alias',
  description:
    'Team word description game where players describe words to their teammates without saying the word itself, racing against a timer to score points.',
  url: 'https://boardly.online/games/alias',
  image: 'https://boardly.online/opengraph-image',
  genre: ['Party Game', 'Word Game', 'Multiplayer', 'Team Game'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 4, maxValue: 16 },
  playMode: 'MultiPlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

export default function AliasGamePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <GameDetailPage
        gameName="Alias"
        title="Alias Is Coming Soon"
        description="A team word game where one player describes secret words and the team races to guess as many as possible."
        icon="🗣️"
        iconLabel="Alias"
        accent="var(--bd-coral)"
        lobbiesHref="/games/alias/lobbies"
        primaryCtaLabel="Coming soon"
        primaryCtaDisabled
        facts={[
          { label: 'Players', value: '4–16' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Game type', value: 'Team' },
        ]}
        introTitle="What is Alias?"
        intro={[
          'Alias is a team word-description game. One player sees a secret word and explains it without saying the word itself.',
          'Correct guesses score points. Skips cost points. Teams take turns until the final score decides the winner.',
        ]}
        steps={[
          { title: 'Create a lobby', desc: 'Invite your group and split into teams.' },
          { title: 'Describe words', desc: 'Use clues, synonyms, and examples without saying the secret word.' },
          { title: 'Guess quickly', desc: 'The team guesses against the timer and scores for correct answers.' },
          { title: 'Switch teams', desc: 'Teams alternate turns until the match ends.' },
        ]}
        benefitsTitle="Why Alias belongs on Boardly"
        benefits={[
          'Designed for group play.',
          'Simple room links for friends.',
          'Fast rounds that work for parties.',
          'No app download planned.',
        ]}
      />
    </>
  )
}
