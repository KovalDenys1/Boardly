import type { Metadata } from 'next'
import Link from 'next/link'

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
      <div className="min-h-[100dvh] bg-gradient-to-br from-green-400 via-teal-500 to-cyan-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          {/* Breadcrumb */}
          <nav className="mb-8 text-white/60 text-sm flex items-center gap-2" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/games" className="hover:text-white transition-colors">Games</Link>
            <span>/</span>
            <span className="text-white">Memory</span>
          </nav>

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="Brain">🧠</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Play Memory Online
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              The classic card-matching game — free, multiplayer, real-time. Test your memory against friends across easy, medium, and hard difficulty.
            </p>
            <Link
              href="/games/memory/lobbies"
              className="inline-block px-10 py-4 bg-white text-teal-600 rounded-2xl font-bold text-lg hover:bg-teal-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Play Memory Now →
            </Link>
          </div>

          {/* Key facts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '2–4' },
              { label: 'Price', value: 'Free' },
              { label: 'Download', value: 'None' },
              { label: 'Difficulty', value: '3 levels' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 text-center text-white">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-white/70 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* What is Memory */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is the Memory Card Game?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Memory (also called Concentration or Matching Pairs) is a card game where all cards are placed face-down. On each turn, a player flips two cards. If they match, the player keeps the pair and takes another turn. If they don't match, the cards are turned back over. The player who collects the most pairs wins.
            </p>
            <p className="text-white/85 leading-relaxed">
              On Boardly, you can play Memory online in real-time with 2–4 players. Choose from easy, medium, or hard difficulty — more cards mean more of a memory challenge!
            </p>
          </section>

          {/* How to play */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Memory Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create or join a lobby', desc: 'Start a new game, pick a difficulty, and invite friends with a room code.' },
                { step: '2', title: 'Flip two cards on your turn', desc: 'Click any face-down card to reveal it, then click a second card to try to find a match.' },
                { step: '3', title: 'Keep pairs, pass on mismatches', desc: 'Matched pairs stay flipped and score you a point. Mismatched cards flip back face-down for others to remember.' },
                { step: '4', title: 'Most pairs wins', desc: 'The game ends when all pairs are found. The player with the most matched pairs wins!' },
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
            <h2 className="text-3xl font-bold mb-6">Why Play Memory on Boardly?</h2>
            <ul className="space-y-3">
              {[
                '⚡ Real-time multiplayer — watch opponents flip cards live',
                '🎯 Three difficulty levels — easy (4×4), medium (6×6), hard (8×8)',
                '👥 2 to 4 players per game',
                '📱 Works on desktop, tablet, and mobile',
                '🆓 Completely free with no account required',
              ].map((item) => (
                <li key={item} className="text-white/85 text-sm leading-relaxed">{item}</li>
              ))}
            </ul>
          </section>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/games/memory/lobbies"
              className="inline-block px-10 py-4 bg-white text-teal-600 rounded-2xl font-bold text-lg hover:bg-teal-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Start a Memory Game →
            </Link>
            <p className="text-white/60 text-sm mt-4">No account required to play as a guest</p>
          </div>
        </div>
      </div>
    </>
  )
}
