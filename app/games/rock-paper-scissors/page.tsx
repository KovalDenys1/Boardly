import type { Metadata } from 'next'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = {
  title: 'Play Rock Paper Scissors Online - Free 2-Player Game',
  description:
    'Play Rock Paper Scissors online with a friend for free! Real-time simultaneous picks, live reveal, and instant results. No download needed. Start on Boardly now!',
  keywords: [
    'rock paper scissors online',
    'rock paper scissors multiplayer',
    'rps game online',
    'rock paper scissors free',
    'rock paper scissors browser game',
    'online rock paper scissors friend',
    'rps two player online',
  ],
  openGraph: {
    title: 'Play Rock Paper Scissors Online | Boardly',
    description:
      'Classic simultaneous-choice game. Pick Rock, Paper, or Scissors — both reveal at the same time. Free, 2 players, no download.',
    url: 'https://boardly.online/games/rock-paper-scissors',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Rock Paper Scissors Online | Boardly',
    description: 'Real-time rock paper scissors in your browser. Pick, reveal, win. Free, no download.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/rock-paper-scissors',
  },
  robots: {
    index: false,
    follow: true,
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Rock Paper Scissors', item: 'https://boardly.online/games/rock-paper-scissors' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Rock Paper Scissors',
  description:
    'Classic two-player simultaneous-choice game. Both players pick Rock, Paper, or Scissors at the same time. Rock beats Scissors, Scissors beats Paper, Paper beats Rock.',
  url: 'https://boardly.online/games/rock-paper-scissors',
  image: 'https://boardly.online/opengraph-image',
  genre: ['Casual Game', 'Multiplayer', 'Strategy'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 2 },
  playMode: 'MultiPlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

export default function RockPaperScissorsGamePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <GameDetailPage
        gameName="Rock Paper Scissors"
        title="Play Rock Paper Scissors Online"
        description="The classic game, played in real time. Both players pick simultaneously — no waiting, no guessing what your opponent chose."
        icon="✊"
        iconLabel="Rock Paper Scissors"
        gameId="rps"
        accentColor="var(--bd-lav)"
        accent="var(--bd-lav)"
        lobbiesHref="/games/rock-paper-scissors/lobbies"
        primaryCtaLabel="Play now"
        playVsBotGameType="rock_paper_scissors"
        facts={[
          { label: 'Players', value: '2' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Game type', value: 'Casual' },
        ]}
        introTitle="What is Rock Paper Scissors?"
        intro={[
          'Rock Paper Scissors is a two-player game where both players pick one of three options at the same time: Rock, Paper, or Scissors.',
          'Rock beats Scissors, Scissors beats Paper, and Paper beats Rock. If both players pick the same option, the round is a draw and replays.',
        ]}
        steps={[
          { title: 'Create or join a lobby', desc: 'Open a room and share the code with your opponent.' },
          { title: 'Pick your move', desc: 'Choose Rock, Paper, or Scissors before the timer runs out.' },
          { title: 'Simultaneous reveal', desc: 'Both choices show at the same time — no waiting for the other player.' },
          { title: 'First to the target wins', desc: 'Play rounds until one player reaches the win count.' },
        ]}
        benefitsTitle="Why play Rock Paper Scissors on Boardly?"
        benefits={[
          'Real-time simultaneous reveals.',
          'Bot support for solo practice.',
          'Instant rounds with no setup.',
          'Free to play as a guest.',
        ]}
      />
    </>
  )
}
