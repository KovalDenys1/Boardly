import type { Metadata } from 'next'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = {
  title: 'Liar\'s Party Coming Soon - Social Bluffing Party Game',
  description:
    'Play Liar\'s Party online with friends for free! 4–12 players, real-time bluffing and voting. Make claims, challenge liars, and survive elimination. No download needed. Start on Boardly now!',
  keywords: [
    "liar's party game online",
    'bluffing game online',
    'social deduction game free',
    'party game online multiplayer',
    "liar's party browser game",
    'online bluff game friends',
    'social party game no download',
  ],
  openGraph: {
    title: "Liar's Party Coming Soon | Boardly",
    description:
      "Make claims, vote on who's bluffing, and avoid elimination. Free social bluffing game for 4–12 players.",
    url: 'https://boardly.online/games/liars-party',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Liar's Party Coming Soon | Boardly",
    description: 'Real-time bluffing party game in your browser. Claim, challenge, survive. Free, no download.',
  },
  alternates: {
    canonical: 'https://boardly.online/games/liars-party',
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
    { '@type': 'ListItem', position: 3, name: "Liar's Party", item: 'https://boardly.online/games/liars-party' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: "Liar's Party",
  description:
    'Social bluffing party game where players make claims (true or bluff), others vote to challenge or believe, and players are eliminated after too many caught bluffs.',
  url: 'https://boardly.online/games/liars-party',
  image: 'https://boardly.online/opengraph-image',
  genre: ['Party Game', 'Social Deduction', 'Multiplayer', 'Bluffing'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 4, maxValue: 12 },
  playMode: 'MultiPlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

export default function LiarsPartyGamePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <GameDetailPage
        gameName="Liar's Party"
        title="Liar's Party Is Coming Soon"
        description="A social bluffing game where players make claims, read the room, and vote on who is telling the truth."
        icon="🎭"
        iconLabel="Liar's Party"
        accent="var(--bd-lav)"
        lobbiesHref="/games/liars-party/lobbies"
        primaryCtaLabel="Coming soon"
        primaryCtaDisabled
        facts={[
          { label: 'Players', value: '4–12' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Game type', value: 'Social' },
        ]}
        introTitle="What is Liar's Party?"
        intro={[
          'Liar\'s Party is a social bluffing game. One player makes a claim, and everyone else decides whether to believe it or challenge it.',
          'Good reads earn points. Bad reads cost you. Get caught too many times and you are out of the round.',
        ]}
        steps={[
          { title: 'Create a lobby', desc: 'Invite a group and start a round together.' },
          { title: 'Make your claim', desc: 'Tell the truth or bluff, then mark it secretly.' },
          { title: 'Vote', desc: 'Other players choose whether to believe or challenge the claim.' },
          { title: 'Reveal and survive', desc: 'The truth comes out and the scoreboard updates.' },
        ]}
        benefitsTitle="Why Liar's Party belongs on Boardly"
        benefits={[
          'Built for shared room play.',
          'Clear voting and reveal moments.',
          'Great for social groups.',
          'No app download planned.',
        ]}
      />
    </>
  )
}
