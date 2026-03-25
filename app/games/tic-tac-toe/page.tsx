import type { Metadata } from 'next'
import Link from 'next/link'

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
    url: 'https://www.boardly.online/games/tic-tac-toe',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Tic Tac Toe Online Free | Boardly',
    description: 'Real-time multiplayer Tic Tac Toe in your browser. Free, no account needed.',
  },
  alternates: {
    canonical: 'https://www.boardly.online/games/tic-tac-toe',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Tic Tac Toe',
  description:
    'Classic 3×3 grid strategy game where two players alternate placing X and O marks, aiming to get three in a row.',
  url: 'https://www.boardly.online/games/tic-tac-toe',
  image: 'https://www.boardly.online/opengraph-image',
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
    url: 'https://www.boardly.online',
  },
}

export default function TicTacToePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="X mark">❌</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Play Tic Tac Toe Online
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              The timeless 2-player classic — free, real-time, right in your browser. Challenge a friend or test your skills against AI.
            </p>
            <Link
              href="/lobby/create?gameType=tic_tac_toe"
              className="inline-block px-10 py-4 bg-white text-orange-600 rounded-2xl font-bold text-lg hover:bg-orange-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Play Tic Tac Toe Now →
            </Link>
          </div>

          {/* Key facts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '2' },
              { label: 'Price', value: 'Free' },
              { label: 'Download', value: 'None' },
              { label: 'Bot support', value: 'Yes' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 text-center text-white">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-white/70 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* What is TTT */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is Tic Tac Toe?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Tic Tac Toe (also known as Noughts and Crosses, or Xs and Os) is a classic two-player strategy game played on a 3×3 grid. Players take turns placing their mark — X or O — and the first to get three in a row (horizontally, vertically, or diagonally) wins.
            </p>
            <p className="text-white/85 leading-relaxed">
              On Boardly, you can play Tic Tac Toe online in real-time with friends, compete in best-of-3 or best-of-5 match mode, or sharpen your strategy against an AI opponent — all for free in your browser.
            </p>
          </section>

          {/* How to play */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Tic Tac Toe Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create or join a lobby', desc: 'Start a game instantly and share the room code with your opponent.' },
                { step: '2', title: 'Take turns placing marks', desc: 'X always goes first. Click any empty cell on the 3×3 grid to place your mark.' },
                { step: '3', title: 'Get three in a row to win', desc: 'Line up three of your marks horizontally, vertically, or diagonally before your opponent does.' },
                { step: '4', title: 'Play match mode', desc: 'Choose best-of-3 or best-of-5 to settle the score over multiple rounds.' },
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
            <h2 className="text-3xl font-bold mb-6">Why Play Tic Tac Toe on Boardly?</h2>
            <ul className="space-y-3">
              {[
                '⚡ Real-time gameplay — moves appear instantly for both players',
                '🤖 AI opponent available when playing solo',
                '🏆 Match mode — best-of-3 or best-of-5 for competitive play',
                '📱 Plays perfectly on mobile, tablet, and desktop',
                '🆓 Completely free with no ads or paywalls',
              ].map((item) => (
                <li key={item} className="text-white/85 text-sm leading-relaxed">{item}</li>
              ))}
            </ul>
          </section>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/lobby/create?gameType=tic_tac_toe"
              className="inline-block px-10 py-4 bg-white text-orange-600 rounded-2xl font-bold text-lg hover:bg-orange-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Start a Match →
            </Link>
            <p className="text-white/60 text-sm mt-4">No account required to play as a guest</p>
          </div>
        </div>
      </div>
    </>
  )
}
