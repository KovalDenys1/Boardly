import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Play Tic Tac Toe Online - Rules & Winning Strategy',
  description:
    'Learn how to play Tic Tac Toe online. Rules explained, winning strategies for X and O, how to never lose, AI opponent tips, and how to play multiplayer with friends for free.',
  keywords: [
    'how to play tic tac toe online',
    'tic tac toe rules',
    'tic tac toe strategy',
    'tic tac toe winning strategy',
    'noughts and crosses rules',
    'tic tac toe tips',
    'play tic tac toe with friends online',
    'tic tac toe guide',
  ],
  openGraph: {
    title: 'How to Play Tic Tac Toe Online | Boardly',
    description: 'Complete Tic Tac Toe guide — rules, winning strategies, and tips to never lose. Free multiplayer in your browser.',
    url: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online',
    type: 'article',
  },
  alternates: {
    canonical: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Tic Tac Toe Online — Rules & Winning Strategy',
  description: 'Complete guide to Tic Tac Toe — rules, winning strategies for X and O, and tips to never lose.',
  url: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2026-05-07',
  dateModified: '2026-05-07',
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'How to Play Tic Tac Toe Online', item: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online' },
  ],
}

export default function HowToPlayTicTacToeGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <div className="min-h-[100dvh] bg-gradient-to-br from-orange-500 via-red-500 to-pink-600">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">

          {/* Breadcrumb */}
          <nav className="mb-6 text-white/60 text-sm flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guides" className="hover:text-white transition-colors">Guides</Link>
            <span>/</span>
            <span className="text-white">How to Play Tic Tac Toe Online</span>
          </nav>

          {/* Header */}
          <header className="mb-8 sm:mb-12">
            <div className="text-5xl sm:text-6xl mb-4">⭕</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight break-words">
              How to Play Tic Tac Toe Online
            </h1>
            <p className="text-white/70 text-sm">4 min read · Free to play on Boardly · 2 players or vs AI</p>
          </header>

          {/* Intro */}
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <p className="text-white/90 leading-relaxed text-lg">
              Tic Tac Toe (also called Noughts and Crosses) is one of the most widely known two-player games in the world. Two players take turns placing their mark (X or O) on a 3×3 grid. The first to get three in a row — horizontally, vertically, or diagonally — wins. Sounds simple, but with the right strategy you can guarantee you never lose.
            </p>
          </div>

          {/* What you need */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">What You Need</h2>
            <ul className="space-y-2 text-white/85">
              <li>✅ 2 players — or play solo against AI</li>
              <li>✅ A browser — desktop, tablet, or mobile</li>
              <li>✅ No account required (guest play available)</li>
              <li>✅ Free — no ads, no download</li>
            </ul>
          </section>

          {/* Rules */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">The Rules</h2>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Choose your mark', desc: 'One player is X, the other is O. X always goes first.' },
                { step: '2', title: 'Take turns', desc: 'Players alternate placing their mark in any empty cell on the 3×3 grid.' },
                { step: '3', title: 'Win with three in a row', desc: 'Get three of your marks in a row — horizontally, vertically, or diagonally — and you win.' },
                { step: '4', title: 'Draw', desc: 'If all 9 cells are filled and neither player has three in a row, the game is a draw. With perfect play from both sides, every game ends in a draw.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">{step}</div>
                  <div>
                    <strong className="block mb-1">{title}</strong>
                    <p className="text-white/75 text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Winning positions */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">All 8 Winning Lines</h2>
            <p className="text-white/80 text-sm mb-4">There are exactly 8 ways to win. Three in any of these lines wins the game:</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                'Top row (1-2-3)',
                'Middle row (4-5-6)',
                'Bottom row (7-8-9)',
                'Left column (1-4-7)',
                'Middle column (2-5-8)',
                'Right column (3-6-9)',
                'Diagonal (1-5-9)',
                'Diagonal (3-5-7)',
              ].map((line) => (
                <div key={line} className="bg-white/10 rounded-xl px-3 py-2 text-white/80">{line}</div>
              ))}
            </div>
          </section>

          {/* Strategy */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Strategy — How to Never Lose</h2>
            <ul className="space-y-4">
              {[
                {
                  tip: 'Start in the center (as X)',
                  detail: 'The center square (5) is part of 4 winning lines — more than any other cell. Taking it first as X gives you the most winning options and forces your opponent to play defensively.',
                },
                {
                  tip: 'Take a corner if center is taken',
                  detail: 'Corners are each part of 3 winning lines. If your opponent takes center, play a corner. This sets up diagonal threats they must respond to.',
                },
                {
                  tip: 'Block before attacking',
                  detail: 'If your opponent has two in a row, block the third cell immediately. Missing a block almost always loses the game.',
                },
                {
                  tip: 'Create a fork',
                  detail: 'A fork means you have two different ways to win at once. Your opponent can only block one, so you win the other. To fork: place your mark so it threatens two different winning lines simultaneously.',
                },
                {
                  tip: 'Block forks',
                  detail: 'If your opponent is setting up a fork, block it — either by playing the cell they need, or by creating a threat that forces them to defend elsewhere.',
                },
              ].map(({ tip, detail }) => (
                <li key={tip} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <strong className="block mb-1">💡 {tip}</strong>
                  <p className="text-white/75 text-sm">{detail}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* Playing on Boardly */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Playing on Boardly</h2>
            <div className="space-y-3 text-white/85 text-sm">
              <p><strong className="text-white">vs AI:</strong> Play solo against a bot — great for practising strategy without waiting for an opponent.</p>
              <p><strong className="text-white">vs Friend:</strong> Share a lobby link and play in real time. No account needed for either player.</p>
              <p><strong className="text-white">Match mode:</strong> Play a series of rounds to determine the overall winner — best of 3 or best of 5.</p>
            </div>
          </section>

          {/* CTA */}
          <div className="text-center">
            <p className="text-white/80 mb-4">Ready to put your strategy to the test?</p>
            <Link
              href="/games/tic-tac-toe"
              className="inline-block px-10 py-4 bg-white text-orange-600 rounded-2xl font-bold text-lg hover:bg-orange-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Play Tic Tac Toe Now →
            </Link>
            <p className="text-white/50 text-sm mt-3">Free · No account required · vs AI or 2 players</p>
          </div>

          {/* Related */}
          <div className="mt-12 pt-8 border-t border-white/20">
            <h3 className="text-white/70 text-sm font-semibold mb-4 uppercase tracking-wide">More guides</h3>
            <div className="flex flex-col gap-3">
              <Link href="/guides/how-to-play-yahtzee-online" className="text-white hover:underline text-sm">→ How to Play Yahtzee Online with Friends</Link>
              <Link href="/guides/how-to-play-memory-card-game-online" className="text-white hover:underline text-sm">→ How to Play Memory Card Game Online</Link>
              <Link href="/guides/how-to-play-spy-game-online" className="text-white hover:underline text-sm">→ How to Play Guess the Spy Online</Link>
              <Link href="/guides/best-free-multiplayer-browser-games" className="text-white hover:underline text-sm">→ Best Free Multiplayer Browser Games in 2026</Link>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
