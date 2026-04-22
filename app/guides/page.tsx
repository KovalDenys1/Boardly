import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Board Game Guides & Tips - How to Play Online',
  description:
    'Learn how to play popular board games online. Step-by-step guides for Yahtzee, Spy, Memory, Tic Tac Toe and more. Free multiplayer games in your browser.',
  openGraph: {
    title: 'Board Game Guides & Tips | Boardly',
    description: 'Step-by-step guides for playing board games online with friends.',
    url: 'https://boardly.online/guides',
    type: 'website',
  },
  alternates: {
    canonical: 'https://boardly.online/guides',
  },
}

const guides = [
  {
    slug: 'how-to-play-yahtzee-online',
    title: 'How to Play Yahtzee Online with Friends',
    description: 'Complete guide to playing Yahtzee online — scoring categories, strategy tips, and how to set up a multiplayer game.',
    emoji: '🎲',
    readTime: '5 min read',
  },
  {
    slug: 'best-free-multiplayer-browser-games',
    title: 'Best Free Multiplayer Browser Games in 2025',
    description: 'No download, no payment. The best multiplayer games you can play right now in any browser with friends.',
    emoji: '🎮',
    readTime: '4 min read',
  },
  {
    slug: 'how-to-play-spy-game-online',
    title: 'How to Play Guess the Spy Online',
    description: 'Master the social deduction game — tips for finding the spy, bluffing as the spy, and running a great game night.',
    emoji: '🕵️',
    readTime: '4 min read',
  },
]

export default function GuidesPage() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* Breadcrumb */}
        <nav className="mb-8 text-white/60 text-sm flex items-center gap-2" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <span>/</span>
          <span className="text-white">Guides</span>
        </nav>

        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
            Guides
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            How to play, strategy tips, and everything you need to win.
          </p>
        </div>

        <div className="space-y-6">
          {guides.map(({ slug, title, description, emoji, readTime }) => (
            <Link
              key={slug}
              href={`/guides/${slug}`}
              className="group flex gap-5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl p-6 text-white transition-all duration-300 hover:scale-[1.01]"
            >
              <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-3xl">
                {emoji}
              </div>
              <div className="flex-grow">
                <h2 className="text-xl font-bold mb-1 group-hover:underline">{title}</h2>
                <p className="text-white/70 text-sm mb-2">{description}</p>
                <span className="text-white/50 text-xs">{readTime}</span>
              </div>
              <div className="flex-shrink-0 self-center text-white/40 group-hover:text-white text-xl transition-colors">
                →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
