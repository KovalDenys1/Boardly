import type { Metadata } from 'next'
import Link from 'next/link'

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
    url: 'https://www.boardly.online/games/spy',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Guess the Spy Online Free | Boardly',
    description: 'Real-time social deduction game in your browser. Find the spy — or be the spy. Free, no download.',
  },
  alternates: {
    canonical: 'https://www.boardly.online/games/spy',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://www.boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: 'Guess the Spy', item: 'https://www.boardly.online/games/spy' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Guess the Spy',
  description:
    'Social deduction party game where most players share a secret location while one player — the spy — tries to blend in without knowing where they are.',
  url: 'https://www.boardly.online/games/spy',
  image: 'https://www.boardly.online/opengraph-image',
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
    url: 'https://www.boardly.online',
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
      <div className="min-h-[100dvh] bg-gradient-to-br from-red-500 via-pink-600 to-purple-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          {/* Breadcrumb */}
          <nav className="mb-8 text-white/60 text-sm flex items-center gap-2" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/games" className="hover:text-white transition-colors">Games</Link>
            <span>/</span>
            <span className="text-white">Guess the Spy</span>
          </nav>

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="Spy">🕵️</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Play Guess the Spy Online
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              A secret location. One spy who doesn&apos;t know it. Can the group expose the spy — or will the spy guess the location first? Free for 3–10 players.
            </p>
            <Link
              href="/lobby/create?gameType=guess_the_spy"
              className="inline-block px-10 py-4 bg-white text-red-600 rounded-2xl font-bold text-lg hover:bg-red-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Play Guess the Spy Now →
            </Link>
          </div>

          {/* Key facts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '3–10' },
              { label: 'Price', value: 'Free' },
              { label: 'Download', value: 'None' },
              { label: 'Game type', value: 'Party' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 text-center text-white">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-white/70 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* What is it */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is Guess the Spy?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Guess the Spy is a social deduction party game inspired by Spyfall. At the start of each round, all players except one receive a secret location (e.g. &quot;Beach&quot;, &quot;Hospital&quot;, &quot;Space Station&quot;). The odd one out is the spy — they know they&apos;re the spy, but not the location.
            </p>
            <p className="text-white/85 leading-relaxed">
              Players take turns asking each other questions about the location. The group tries to expose the spy through questioning, while the spy tries to blend in and guess the location before time runs out or being voted out.
            </p>
          </section>

          {/* How to play */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Guess the Spy Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create a lobby', desc: 'Start a game and invite 3–10 friends with a room code or link.' },
                { step: '2', title: 'Roles are assigned', desc: 'Everyone gets the secret location — except the spy, who only knows they\'re the spy.' },
                { step: '3', title: 'Ask questions', desc: 'Players take turns asking each other location-themed questions. Try to expose the spy without giving away the location!' },
                { step: '4', title: 'Vote or guess', desc: 'Call a vote to expose the spy, or let the spy guess the location. Each side tries to outsmart the other.' },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                    {step}
                  </span>
                  <div>
                    <strong className="block">{title}</strong>
                    <span className="text-white/75 text-sm">{desc}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Why Boardly */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-12 text-white">
            <h2 className="text-3xl font-bold mb-6">Why Play Guess the Spy on Boardly?</h2>
            <ul className="space-y-3">
              {[
                '⚡ Real-time gameplay — everything happens live with your group',
                '👥 Perfect for 3–10 players — great for parties and game nights',
                '🎭 Multiple locations keep every round fresh',
                '📱 Play from any device — no app install needed',
                '🆓 Completely free — invite your whole group for nothing',
              ].map((item) => (
                <li key={item} className="text-white/85 text-sm leading-relaxed">{item}</li>
              ))}
            </ul>
          </section>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/lobby/create?gameType=guess_the_spy"
              className="inline-block px-10 py-4 bg-white text-red-600 rounded-2xl font-bold text-lg hover:bg-red-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Start a Spy Game →
            </Link>
            <p className="text-white/60 text-sm mt-4">No account required to play as a guest</p>
          </div>
        </div>
      </div>
    </>
  )
}
