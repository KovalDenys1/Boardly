import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Best 2 Player Games Online Free - No Download',
  description:
    'The best free 2 player games you can play online right now. Tic Tac Toe, Memory, and more — no download, no account required. Play with a friend in seconds.',
  keywords: [
    'best 2 player games online',
    '2 player games online free',
    'two player games online no download',
    'online games for 2 players',
    'free 2 player browser games',
    '2 player board games online',
    'play games with one friend online',
    'two player games free',
  ],
  openGraph: {
    title: 'Best 2 Player Games Online Free | Boardly',
    description: 'Top free 2 player games you can play in your browser right now — no download, no account needed.',
    url: 'https://boardly.online/guides/best-2-player-games-online',
    type: 'article',
  },
  alternates: {
    canonical: 'https://boardly.online/guides/best-2-player-games-online',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Best 2 Player Games Online Free — No Download Required',
  description: 'A curated list of the best free 2 player games you can play in any browser instantly.',
  url: 'https://boardly.online/guides/best-2-player-games-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2026-05-08',
  dateModified: '2026-05-08',
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'Best 2 Player Games Online', item: 'https://boardly.online/guides/best-2-player-games-online' },
  ],
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the best free 2 player games online?',
      acceptedAnswer: { '@type': 'Answer', text: 'The best free 2 player games online include Tic Tac Toe (quick 1v1 strategy), Memory card game (competitive matching), and Yahtzee (dice strategy). All are available on Boardly with no download or account required.' },
    },
    {
      '@type': 'Question',
      name: 'Can I play 2 player games online for free with no download?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes. All games on Boardly run directly in your browser — desktop, tablet, or mobile. Just share a lobby link with your friend and you are both in the same game within seconds.' },
    },
    {
      '@type': 'Question',
      name: 'What is the best quick 2 player game online?',
      acceptedAnswer: { '@type': 'Answer', text: 'Tic Tac Toe is the fastest 2 player game online — a single round takes under a minute. Play best-of-3 or best-of-5 for a competitive session that still fits in 5 minutes.' },
    },
    {
      '@type': 'Question',
      name: 'What 2 player online game is best for competing with a friend?',
      acceptedAnswer: { '@type': 'Answer', text: 'Memory card game is great for close competitive play — both players see the same board, and the winner is decided by memory and attention. Yahtzee adds dice strategy and is better for longer sessions.' },
    },
    {
      '@type': 'Question',
      name: 'Do both players need an account to play?',
      acceptedAnswer: { '@type': 'Answer', text: 'No. Neither player needs an account. One player creates a lobby, shares the link, and the second player joins instantly as a guest.' },
    },
  ],
}

const games = [
  {
    rank: 1,
    emoji: '⭕',
    name: 'Tic Tac Toe',
    href: '/games/tic-tac-toe',
    guideHref: '/guides/how-to-play-tic-tac-toe-online',
    tagline: 'Best for: Quick 1v1 matches',
    why: 'The fastest 2 player game online. A round takes under a minute. Play best-of-3 or best-of-5 for a real competitive series — rematch ready in seconds. Supports an AI opponent if your friend is not available.',
    tip: 'Take the center square first. It is part of 4 winning lines — more than any other cell.',
  },
  {
    rank: 2,
    emoji: '🧠',
    name: 'Memory Card Game',
    href: '/games/memory',
    guideHref: '/guides/how-to-play-memory-card-game-online',
    tagline: 'Best for: Competitive matching',
    why: 'Flip cards, find pairs, beat your opponent. Both players see the same board — when your opponent misses a pair, you see exactly where it is. Three difficulty levels: Easy (8 pairs), Medium (12 pairs), Hard (15 pairs).',
    tip: 'Pay attention when your opponent flips — their misses are hints for your next turn.',
  },
  {
    rank: 3,
    emoji: '🎲',
    name: 'Yahtzee',
    href: '/games/yahtzee',
    guideHref: '/guides/how-to-play-yahtzee-online',
    tagline: 'Best for: Longer strategy sessions',
    why: 'Roll five dice, fill 15 scoring categories, outscore your opponent. A full 2-player game takes 15–20 minutes. More strategic than the others — the dice create variance, but smart category choices win games.',
    tip: 'Chase the upper section bonus early: 35 points for scoring 63+ in Ones through Sixes.',
  },
]

export default function Best2PlayerGamesGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="min-h-[100dvh] bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">

          {/* Breadcrumb */}
          <nav className="mb-6 text-white/60 text-sm flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guides" className="hover:text-white transition-colors">Guides</Link>
            <span>/</span>
            <span className="text-white">Best 2 Player Games Online</span>
          </nav>

          {/* Header */}
          <header className="mb-8 sm:mb-12">
            <div className="text-5xl sm:text-6xl mb-4">🎮</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight break-words">
              Best 2 Player Games Online — Free, No Download
            </h1>
            <p className="text-white/70 text-sm">4 min read · All games free on Boardly · No account required</p>
          </header>

          {/* Intro */}
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <p className="text-white/90 leading-relaxed text-lg">
              Playing online with one friend should be instant. Share a link, both join, start playing — no app download, no account, no waiting. These are the best free 2 player games you can play right now in any browser.
            </p>
          </div>

          {/* Quick comparison */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Quick Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/20 text-white/60 text-xs uppercase tracking-wide">
                    <th className="text-left py-2 pr-4">Game</th>
                    <th className="text-left py-2 pr-4">Round length</th>
                    <th className="text-left py-2">Skill type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <tr>
                    <td className="py-3 pr-4 font-semibold">Tic Tac Toe</td>
                    <td className="py-3 pr-4 text-white/75">&lt;1 min</td>
                    <td className="py-3 text-white/75">Pattern recognition</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold">Memory</td>
                    <td className="py-3 pr-4 text-white/75">5–10 min</td>
                    <td className="py-3 text-white/75">Memory & attention</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold">Yahtzee</td>
                    <td className="py-3 pr-4 text-white/75">15–20 min</td>
                    <td className="py-3 text-white/75">Dice + strategy</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Games */}
          <section className="space-y-6 mb-12">
            <h2 className="text-2xl font-bold text-white">The Best 2 Player Games</h2>
            {games.map(({ rank, emoji, name, href, guideHref, tagline, why, tip }) => (
              <div key={name} className="bg-white/10 backdrop-blur-md rounded-3xl p-6 text-white">
                <div className="flex items-start gap-4 mb-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                    {rank}
                  </span>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-2xl">{emoji}</span>
                      <h3 className="text-xl font-bold">{name}</h3>
                    </div>
                    <span className="text-white/50 text-xs">{tagline}</span>
                  </div>
                </div>
                <p className="text-white/80 text-sm mb-3 leading-relaxed">{why}</p>
                <p className="text-white/55 text-xs mb-4 italic">💡 {tip}</p>
                <div className="flex gap-3 flex-wrap">
                  <Link
                    href={href}
                    className="inline-block px-5 py-2.5 bg-white text-purple-700 rounded-xl text-sm font-bold transition-all duration-300 hover:bg-purple-50"
                  >
                    Play {name} →
                  </Link>
                  <Link
                    href={guideHref}
                    className="inline-block px-5 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-semibold transition-all duration-300"
                  >
                    Full guide
                  </Link>
                </div>
              </div>
            ))}
          </section>

          {/* Tips */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Tips for Playing Online with One Friend</h2>
            <ul className="space-y-3 text-sm text-white/85">
              <li>✅ <strong>Share the lobby link directly</strong> — no account needed for either player</li>
              <li>✅ <strong>Play on any device</strong> — desktop, mobile, and tablet all work</li>
              <li>✅ <strong>Rematch in one click</strong> — no need to set up a new game after each round</li>
              <li>✅ <strong>No time limits</strong> — play at whatever pace works for your session</li>
            </ul>
          </section>

          {/* CTA */}
          <div className="text-center">
            <p className="text-white/80 mb-4">Pick a game and challenge your friend now.</p>
            <Link
              href="/games"
              className="inline-block px-10 py-4 bg-white text-purple-700 rounded-2xl font-bold text-lg hover:bg-purple-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Browse All Games →
            </Link>
            <p className="text-white/50 text-sm mt-3">Free · No account required · Play in seconds</p>
          </div>

          {/* Related */}
          <div className="mt-12 pt-8 border-t border-white/20">
            <h3 className="text-white/70 text-sm font-semibold mb-4 uppercase tracking-wide">More guides</h3>
            <div className="flex flex-col gap-3">
              <Link href="/guides/how-to-play-tic-tac-toe-online" className="text-white hover:underline text-sm">→ How to Play Tic Tac Toe Online</Link>
              <Link href="/guides/how-to-play-memory-card-game-online" className="text-white hover:underline text-sm">→ How to Play Memory Card Game Online</Link>
              <Link href="/guides/how-to-play-yahtzee-online" className="text-white hover:underline text-sm">→ How to Play Yahtzee Online with Friends</Link>
              <Link href="/guides/best-free-multiplayer-browser-games" className="text-white hover:underline text-sm">→ Best Free Multiplayer Browser Games in 2026</Link>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
