import type { Metadata } from 'next'
import Link from 'next/link'

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
    url: 'https://www.boardly.online/games/alias',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alias Coming Soon | Boardly',
    description: 'Real-time team word game in your browser. Describe, guess, and score. Free, no download.',
  },
  alternates: {
    canonical: 'https://www.boardly.online/games/alias',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://www.boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Alias', item: 'https://www.boardly.online/games/alias' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Alias',
  description:
    'Team word description game where players describe words to their teammates without saying the word itself, racing against a timer to score points.',
  url: 'https://www.boardly.online/games/alias',
  image: 'https://www.boardly.online/opengraph-image',
  genre: ['Party Game', 'Word Game', 'Multiplayer', 'Team Game'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 4, maxValue: 16 },
  playMode: 'MultiPlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://www.boardly.online' },
}

export default function AliasGamePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-red-500 to-pink-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          <nav className="mb-8 text-white/60 text-sm flex items-center gap-2" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/games" className="hover:text-white transition-colors">Games</Link>
            <span>/</span>
            <span className="text-white">Alias</span>
          </nav>

          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="Alias">🗣️</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Alias Is Coming Soon
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              Two teams, one goal: describe as many words as possible before the timer runs out.
              Guessing earns points — skipping costs them. Best team wins. Free for 4–16 players.
            </p>
            <span
              aria-disabled="true"
              className="inline-block cursor-not-allowed px-10 py-4 bg-white/80 text-orange-700 rounded-2xl font-bold text-lg shadow-xl"
            >
              Coming Soon
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '4–16' },
              { label: 'Price', value: 'Free' },
              { label: 'Download', value: 'None' },
              { label: 'Game type', value: 'Team' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 text-center text-white">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-white/70 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is Alias?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Alias is a classic team word-description game. Players split into two teams. Each turn,
              one player — the describer — gets 10 secret words and must explain them to their teammates
              without using the word itself. Every correct guess earns a point; every skip loses one.
            </p>
            <p className="text-white/85 leading-relaxed">
              Teams alternate turns for 3 rounds each. The team with the most points at the end wins.
              Fast, fun, and works great with any group.
            </p>
          </section>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Alias Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create a lobby', desc: 'Start a game and invite 4–16 friends with a room code or link. Teams are assigned automatically.' },
                { step: '2', title: 'Describe words', desc: 'The describer sees 10 words one at a time. Explain each word without saying it — use synonyms, actions, or examples.' },
                { step: '3', title: 'Guess or skip', desc: 'Teammates shout the answer. Correct guess: +1 point. Skip: −1 point. You have 60 seconds.' },
                { step: '4', title: 'Switch teams', desc: 'Teams alternate turns. After 3 turns each, the team with more points wins!' },
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
              className="inline-block cursor-not-allowed px-8 py-3 bg-white/80 text-orange-700 rounded-xl font-bold"
            >
              Coming Soon
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
