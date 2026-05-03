import type { Metadata } from 'next'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = {
  title: 'Play Memory Card Game Online Free - Multiplayer',
  description:
    'Play Memory card matching game online with friends for free! 2–4 players, multiple difficulty levels, real-time multiplayer. No download needed. Start playing on Boardly now!',
  keywords: [
    'memory card game online',
    'memory match game online',
    'memory game multiplayer',
    'concentration card game online',
    'memory game free',
    'flip card game online',
    'matching card game online',
    'memory game browser',
  ],
  openGraph: {
    title: 'Play Memory Card Game Online Free - Multiplayer | Boardly',
    description:
      'Flip cards, find matching pairs, beat your friends in real-time Memory. Free, 2–4 players, multiple difficulty levels.',
    url: 'https://boardly.online/games/memory',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Memory Card Game Online Free | Boardly',
    description: 'Real-time multiplayer Memory card game in your browser. Free, no download.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/memory',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Memory', item: 'https://boardly.online/games/memory' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Memory Card Game',
  description:
    'Multiplayer card-matching game where players flip pairs of cards trying to find matches. The player with the most matched pairs wins.',
  url: 'https://boardly.online/games/memory',
  image: 'https://boardly.online/opengraph-image',
  genre: ['Puzzle', 'Memory', 'Multiplayer'],
  numberOfPlayers: {
    '@type': 'QuantitativeValue',
    minValue: 2,
    maxValue: 4,
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

export default function MemoryPage() {
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
        gameName="Memory"
        title="Play Memory Online"
        description="Flip cards, find matching pairs, and test your memory against friends in a clean multiplayer board."
        icon="🧠"
        iconLabel="Brain"
        accent="var(--bd-mint)"
        lobbiesHref="/games/memory/lobbies"
        facts={[
          { label: 'Players', value: '2–4' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Difficulty', value: '3 levels' },
        ]}
        introTitle="What is Memory?"
        intro={[
          'Memory, also called Matching Pairs, is a card game where all cards start face-down. On each turn, a player flips two cards and tries to find a match.',
          'If the cards match, that player scores the pair. If they do not match, the cards turn back over and everyone tries to remember where they were.',
        ]}
        steps={[
          { title: 'Create or join a lobby', desc: 'Pick a difficulty and invite friends with the room code.' },
          { title: 'Flip two cards', desc: 'Reveal two face-down cards on your turn.' },
          { title: 'Keep the matches', desc: 'Matched pairs stay open and add to your score.' },
          { title: 'Find the most pairs', desc: 'When all cards are matched, the highest score wins.' },
        ]}
        benefitsTitle="Why play Memory on Boardly?"
        benefits={[
          'Three difficulty levels for different groups.',
          'Live board updates for every player.',
          'Simple controls that work well on mobile.',
          'Free to play as a guest.',
        ]}
      />
    </>
  )
}
