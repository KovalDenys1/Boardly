import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Best Free Multiplayer Browser Games 2025 - No Download',
  description:
    'The best free multiplayer browser games you can play right now — no download, no account needed. Yahtzee, Tic Tac Toe, Memory, spy games and more. Play with friends instantly.',
  keywords: [
    'free multiplayer browser games',
    'best online games no download',
    'free online games with friends',
    'multiplayer games no download',
    'browser games 2025',
    'free online board games',
    'play games online with friends free',
    'instant play browser games',
  ],
  openGraph: {
    title: 'Best Free Multiplayer Browser Games 2025 | Boardly',
    description: 'Top free browser games you can play with friends right now — no download, no account required.',
    url: 'https://www.boardly.online/guides/best-free-multiplayer-browser-games',
    type: 'article',
  },
  alternates: {
    canonical: 'https://www.boardly.online/guides/best-free-multiplayer-browser-games',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Best Free Multiplayer Browser Games in 2025 — No Download Required',
  description: 'A curated list of the best free multiplayer games you can play in any browser with friends instantly.',
  url: 'https://www.boardly.online/guides/best-free-multiplayer-browser-games',
  image: 'https://www.boardly.online/opengraph-image',
  datePublished: '2025-01-01',
  dateModified: new Date().toISOString().split('T')[0],
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://www.boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://www.boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://www.boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'Best Free Multiplayer Browser Games 2025', item: 'https://www.boardly.online/guides/best-free-multiplayer-browser-games' },
  ],
}

const games = [
  {
    rank: 1,
    emoji: '🎲',
    name: 'Yahtzee',
    players: '1–4 players',
    href: '/games/yahtzee',
    why: 'The ultimate turn-based dice game. Perfect for remote hangouts — you can chat while playing since there\'s no time pressure between turns. Supports AI bots to fill empty spots.',
    best: 'Casual sessions, family game nights, anyone who likes strategy but wants to relax',
  },
  {
    rank: 2,
    emoji: '🕵️',
    name: 'Guess the Spy',
    players: '3–10 players',
    href: '/games/spy',
    why: 'The best party game for larger groups. No board needed, no pieces — just quick thinking and bluffing. Every round is different thanks to random location assignments.',
    best: 'Game nights, friend groups of 4+, anyone who loves social deduction games like Among Us',
  },
  {
    rank: 3,
    emoji: '🧠',
    name: 'Memory Card Game',
    players: '2–4 players',
    href: '/games/memory',
    why: 'Deceptively competitive. Easy to teach anyone in 30 seconds, but the tension rises fast as the board clears. Three difficulty levels keep it interesting for all ages.',
    best: 'Casual matches, playing with younger friends or family, short sessions',
  },
  {
    rank: 4,
    emoji: '❌',
    name: 'Tic Tac Toe',
    players: '2 players',
    href: '/games/tic-tac-toe',
    why: 'The classic for a reason. Best-of-3 and best-of-5 match modes make it surprisingly competitive. Quick to play, rematch ready in seconds.',
    best: '1-on-1 challenges, killing 5 minutes, testing your reflexes against an AI',
  },
]

export default function BestBrowserGamesGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          {/* Breadcrumb */}
          <nav className="mb-8 text-white/60 text-sm flex items-center gap-2 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guides" className="hover:text-white transition-colors">Guides</Link>
            <span>/</span>
            <span className="text-white">Best Free Multiplayer Browser Games</span>
          </nav>

          {/* Header */}
          <header className="mb-12">
            <div className="text-6xl mb-4">🎮</div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight">
              Best Free Multiplayer Browser Games in 2025
            </h1>
            <p className="text-white/70 text-sm">4 min read · All games free on Boardly · No download required</p>
          </header>

          {/* Intro */}
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <p className="text-white/90 leading-relaxed text-lg">
              The best multiplayer games don&apos;t need a download, a subscription, or an account. They just need a browser and a friend. Here are the top free multiplayer games you can play right now — no setup, no waiting, just open the link and play.
            </p>
          </div>

          {/* What to look for */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">What Makes a Great Browser Multiplayer Game?</h2>
            <ul className="space-y-2 text-white/85 text-sm">
              <li>✅ <strong>Zero setup</strong> — works the moment you open it</li>
              <li>✅ <strong>Easy to share</strong> — one link gets your friends in</li>
              <li>✅ <strong>Short sessions</strong> — rounds that fit in 5–15 minutes</li>
              <li>✅ <strong>No skill barrier</strong> — anyone can join and have fun immediately</li>
              <li>✅ <strong>Real-time or async</strong> — plays well with remote friends</li>
            </ul>
          </section>

          {/* Games list */}
          <section className="space-y-6 mb-12">
            <h2 className="text-2xl font-bold text-white">The Best Games Available Right Now</h2>
            {games.map(({ rank, emoji, name, players, href, why, best }) => (
              <div key={name} className="bg-white/10 backdrop-blur-md rounded-3xl p-6 text-white">
                <div className="flex items-start gap-4 mb-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                    {rank}
                  </span>
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-2xl">{emoji}</span>
                      <h3 className="text-xl font-bold">{name}</h3>
                      <span className="text-white/50 text-xs">{players}</span>
                    </div>
                  </div>
                </div>
                <p className="text-white/80 text-sm mb-3 leading-relaxed">{why}</p>
                <p className="text-white/55 text-xs mb-4"><strong className="text-white/70">Best for:</strong> {best}</p>
                <Link
                  href={href}
                  className="inline-block px-5 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-semibold transition-all duration-300"
                >
                  Play {name} →
                </Link>
              </div>
            ))}
          </section>

          {/* Why browser games */}
          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-2xl font-bold mb-4">Why Browser Games Beat App Downloads</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Convincing a group of friends to all download the same app is surprisingly hard. Someone&apos;s phone is full, someone else can&apos;t find it in their country&apos;s store, and one person is always on a work laptop with no admin rights.
            </p>
            <p className="text-white/85 leading-relaxed">
              Browser games solve all of this. You send one link, everyone opens it, and you&apos;re all in the same game within 30 seconds. No installs, no updates, no friction — just play.
            </p>
          </section>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/games"
              className="inline-block px-10 py-4 bg-white text-blue-600 rounded-2xl font-bold text-lg hover:bg-blue-50 transition-all duration-300 shadow-xl hover:scale-105"
            >
              Browse All Games →
            </Link>
            <p className="text-white/50 text-sm mt-3">All games free · No account required</p>
          </div>

          {/* Related */}
          <div className="mt-12 pt-8 border-t border-white/20">
            <h3 className="text-white/70 text-sm font-semibold mb-4 uppercase tracking-wide">More guides</h3>
            <div className="flex flex-col gap-3">
              <Link href="/guides/how-to-play-yahtzee-online" className="text-white hover:underline text-sm">→ How to Play Yahtzee Online with Friends</Link>
              <Link href="/guides/how-to-play-spy-game-online" className="text-white hover:underline text-sm">→ How to Play Guess the Spy Online</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
