import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Play Yahtzee Online Free - Multiplayer Dice Game',
  description:
    'Play Yahtzee online with friends for free! Roll dice, fill scoring categories, and compete in real-time multiplayer. No download needed. 1–4 players. Start playing instantly on Boardly!',
  keywords: [
    'play yahtzee online',
    'yahtzee online free',
    'yahtzee multiplayer',
    'online yahtzee with friends',
    'dice game online',
    'free yahtzee game',
    'yahtzee browser game',
    'real-time yahtzee',
  ],
  openGraph: {
    title: 'Play Yahtzee Online Free - Multiplayer Dice Game | Boardly',
    description:
      'Roll dice, score combinations, and beat your friends in real-time Yahtzee. Free, no download, 1–4 players.',
    url: 'https://www.boardly.online/games/yahtzee',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Yahtzee Online Free | Boardly',
    description: 'Real-time multiplayer Yahtzee in your browser. Free, no download required.',
  },
  alternates: {
    canonical: 'https://www.boardly.online/games/yahtzee',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Yahtzee',
  description:
    'Classic dice-rolling game where players compete to score the highest by filling 13 scoring categories across five dice rolls.',
  url: 'https://www.boardly.online/games/yahtzee',
  image: 'https://www.boardly.online/opengraph-image',
  genre: ['Dice Game', 'Strategy', 'Multiplayer'],
  numberOfPlayers: {
    '@type': 'QuantitativeValue',
    minValue: 1,
    maxValue: 4,
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

export default function YahtzeePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="Dice">🎲</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Play Yahtzee Online
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              The classic dice game — free, multiplayer, real-time. Challenge your friends or play with AI. No download, no signup required.
            </p>
            <Link
              href="/lobby/create?gameType=yahtzee"
              className="inline-block px-10 py-4 bg-white text-blue-600 rounded-2xl font-bold text-lg hover:bg-blue-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Play Yahtzee Now →
            </Link>
          </div>

          {/* Key facts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '1–4' },
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

          {/* What is Yahtzee */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is Yahtzee?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Yahtzee is a classic dice game where players roll five dice up to three times per turn, trying to score points in 13 different categories — from three-of-a-kind and full house to the coveted Yahtzee (five of a kind). The player with the highest total score wins.
            </p>
            <p className="text-white/85 leading-relaxed">
              On Boardly, you can play Yahtzee online with friends in real-time, take on AI opponents, or practice solo. Every game is played directly in your browser — no app download or account needed.
            </p>
          </section>

          {/* How to play */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Yahtzee Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create or join a lobby', desc: 'Start a new game or enter a room code your friend shared.' },
                { step: '2', title: 'Roll the dice', desc: 'On your turn, roll all five dice. Keep any you like and re-roll the rest — up to two more times.' },
                { step: '3', title: 'Choose a scoring category', desc: 'After your rolls, assign your result to one of 13 categories. Each category can only be used once.' },
                { step: '4', title: 'Highest score wins', desc: 'After all players fill all 13 categories, scores are tallied. Bonuses apply for upper section totals ≥ 63.' },
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
            <h2 className="text-3xl font-bold mb-6">Why Play Yahtzee on Boardly?</h2>
            <ul className="space-y-3">
              {[
                '⚡ Real-time multiplayer — see every roll as it happens',
                '🤖 Play against AI bots when friends are offline',
                '📱 Works on desktop, tablet, and mobile — no app needed',
                '🆓 Completely free — no ads, no paywalls',
                '🔗 Share a link and start playing in seconds',
              ].map((item) => (
                <li key={item} className="text-white/85 text-sm leading-relaxed">{item}</li>
              ))}
            </ul>
          </section>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/lobby/create?gameType=yahtzee"
              className="inline-block px-10 py-4 bg-white text-blue-600 rounded-2xl font-bold text-lg hover:bg-blue-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Start a Yahtzee Game →
            </Link>
            <p className="text-white/60 text-sm mt-4">No account required to play as a guest</p>
          </div>
        </div>
      </div>
    </>
  )
}
