import type { Metadata } from 'next'
import GameDetailPage from '../components/GameDetailPage'

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
      <GameDetailPage
        gameName="Tic Tac Toe"
        title="Play Tic Tac Toe Online"
        description="A clean online version of the classic X and O game. Invite a friend, add a bot, and play a quick match in the browser."
        icon="X"
        iconLabel="Tic Tac Toe board"
        iconVariant="tic-tac-toe"
        accent="var(--bd-sun)"
        lobbiesHref="/games/tic-tac-toe/lobbies"
        facts={[
          { label: 'Players', value: '2' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Bot support', value: 'Yes' },
        ]}
        introTitle="What is Tic Tac Toe?"
        intro={[
          'Tic Tac Toe is a two-player game on a 3x3 grid. Players take turns placing X and O, and the first player to make a full row, column, or diagonal wins.',
          'On Boardly, you can play with a friend, add a bot, or use match mode when one quick round is not enough.',
        ]}
        steps={[
          { title: 'Create or join a lobby', desc: 'Open a room and share the code with your opponent.' },
          { title: 'Choose friend or bot', desc: 'Invite another player or add a bot when you want to play right away.' },
          { title: 'Place your mark', desc: 'Take turns choosing empty cells on the board.' },
          { title: 'Win the line', desc: 'Get three marks in a row before your opponent does.' },
        ]}
        benefitsTitle="Why play Tic Tac Toe on Boardly?"
        benefits={[
          'Fast rooms for quick matches.',
          'Bot support for solo play.',
          'Match mode for best-of series.',
          'Free to play as a guest.',
        ]}
      />
    </>
  )
}
