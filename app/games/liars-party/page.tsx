import type { Metadata } from 'next'
import Link from 'next/link'

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
    url: 'https://www.boardly.online/games/liars-party',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Liar's Party Coming Soon | Boardly",
    description: 'Real-time bluffing party game in your browser. Claim, challenge, survive. Free, no download.',
  },
  alternates: {
    canonical: 'https://www.boardly.online/games/liars-party',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://www.boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: "Liar's Party", item: 'https://www.boardly.online/games/liars-party' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: "Liar's Party",
  description:
    'Social bluffing party game where players make claims (true or bluff), others vote to challenge or believe, and players are eliminated after too many caught bluffs.',
  url: 'https://www.boardly.online/games/liars-party',
  image: 'https://www.boardly.online/opengraph-image',
  genre: ['Party Game', 'Social Deduction', 'Multiplayer', 'Bluffing'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 4, maxValue: 12 },
  playMode: 'MultiPlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://www.boardly.online' },
}

export default function LiarsPartyGamePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="min-h-screen bg-gradient-to-br from-rose-500 via-red-500 to-orange-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          <nav className="mb-8 text-white/60 text-sm flex items-center gap-2" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/games" className="hover:text-white transition-colors">Games</Link>
            <span>/</span>
            <span className="text-white">Liar&apos;s Party</span>
          </nav>

          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="Liar's Party">🎭</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Liar&apos;s Party Is Coming Soon
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              Make claims — true or total bluffs. Everyone votes to challenge or believe.
              Get caught bluffing too many times and you&apos;re out. Free for 4–12 players.
            </p>
            <span
              aria-disabled="true"
              className="inline-block cursor-not-allowed px-10 py-4 bg-white/80 text-rose-700 rounded-2xl font-bold text-lg shadow-xl"
            >
              Coming Soon
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '4–12' },
              { label: 'Price', value: 'Free' },
              { label: 'Download', value: 'None' },
              { label: 'Game type', value: 'Social' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 text-center text-white">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-white/70 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is Liar&apos;s Party?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Liar&apos;s Party is a social bluffing game for 4–12 players. Each round, one player becomes
              the claimant and submits a statement — true or completely made up. Everyone else votes:
              do they challenge (think it&apos;s a bluff) or believe it?
            </p>
            <p className="text-white/85 leading-relaxed">
              Wrong reads cost points and accumulate strikes. Reach the strike limit and you&apos;re eliminated.
              Last player standing — or whoever has the most points after all rounds — wins.
            </p>
          </section>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Liar&apos;s Party Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create a lobby', desc: 'Start a game and invite 4–12 friends with a room code or link.' },
                { step: '2', title: 'Make your claim', desc: "When it's your turn as claimant, write any statement — true fact or complete bluff. Mark it secretly." },
                { step: '3', title: 'Vote', desc: "Other players vote: Challenge (think it's a bluff) or Believe (think it's true). Correct reads earn points; wrong reads lose them." },
                { step: '4', title: 'Reveal and survive', desc: "The truth is revealed. Caught bluffing too many times? You're eliminated. Last one standing wins." },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">{step}</div>
                  <div>
                    <div className="font-semibold">{title}</div>
                    <div className="text-white/75 text-sm mt-1">{desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="text-center">
            <Link
              href="/games"
              className="inline-block px-8 py-3 bg-white/10 border border-white/30 text-white rounded-xl hover:bg-white/20 transition-colors mr-4"
            >
              Back to Games
            </Link>
            <span
              aria-disabled="true"
              className="inline-block cursor-not-allowed px-8 py-3 bg-white/80 text-rose-700 rounded-xl font-bold"
            >
              Coming Soon
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
