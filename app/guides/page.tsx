import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Board Game Guides & Tips - How to Play Online',
  description:
    'Learn how to play popular board games online. Step-by-step guides for Yahtzee, Spy, Memory, Tic Tac Toe and more. Free multiplayer games in your browser.',
  keywords: [
    'board game guides',
    'how to play board games online',
    'online board game rules',
    'board game strategy tips',
    'free multiplayer game guides',
    'boardly guides',
  ],
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

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
  ],
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
    title: 'Best Free Multiplayer Browser Games in 2026',
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
  {
    slug: 'how-to-play-memory-card-game-online',
    title: 'How to Play Memory Card Game Online',
    description: 'Rules, difficulty levels, and strategy tips for the classic card-matching game. Free multiplayer in your browser.',
    emoji: '🧠',
    readTime: '4 min read',
  },
  {
    slug: 'how-to-play-tic-tac-toe-online',
    title: 'How to Play Tic Tac Toe Online',
    description: 'Complete Tic Tac Toe guide — rules, all 8 winning lines, and strategies to never lose. Free vs AI or 2 players.',
    emoji: '⭕',
    readTime: '4 min read',
  },
]

const collectionJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Board Game Guides & Tips',
  description: 'Step-by-step guides for playing board games online with friends.',
  url: 'https://boardly.online/guides',
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  hasPart: guides.map(({ slug, title }) => ({
    '@type': 'Article',
    name: title,
    url: `https://boardly.online/guides/${slug}`,
  })),
}

export default function GuidesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-bd-ink-muted" aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-bd-ink">Home</Link>
          <span>/</span>
          <span className="text-bd-ink">Guides</span>
        </nav>

        {/* Header */}
        <div
          className="bd-card relative mb-8 overflow-hidden p-7 sm:p-8"
          style={{ background: 'linear-gradient(120deg, white 0%, rgba(155,140,255,0.08) 100%)' }}
        >
          <div className="bd-dot-grid absolute inset-0 opacity-35" />
          <div className="relative">
            <span className="bd-kicker mb-2 block">Guides</span>
            <h1
              className="mb-2 text-[clamp(32px,4vw,52px)] font-extrabold leading-none tracking-tight text-bd-ink"
              style={{ fontFamily: 'var(--bd-font-display)' }}
            >
              Tips & How-to-Play
            </h1>
            <p className="max-w-[480px] text-[15px] text-bd-ink-soft">
              How to play, strategy tips, and everything you need to win.
            </p>
          </div>
        </div>

        {/* Guide list */}
        <div className="flex flex-col gap-3">
          {guides.map(({ slug, title, description, emoji, readTime }) => (
            <Link
              key={slug}
              href={`/guides/${slug}`}
              className="bd-card group flex gap-5 p-6 transition-all hover:-translate-y-0.5"
            >
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-bg2 text-3xl shadow-[2px_2px_0_var(--bd-ink)]">
                {emoji}
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  className="mb-1 text-lg font-bold text-bd-ink group-hover:text-bd-coral"
                  style={{ fontFamily: 'var(--bd-font-display)' }}
                >
                  {title}
                </h2>
                <p className="mb-2 text-sm text-bd-ink-soft">{description}</p>
                <span className="bd-chip text-xs">{readTime}</span>
              </div>
              <div className="flex shrink-0 items-center text-bd-ink-muted transition-colors group-hover:text-bd-ink">
                →
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
    </>
  )
}
