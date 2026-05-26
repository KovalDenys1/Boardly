import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'

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
  alternates: { canonical: 'https://boardly.online/guides' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
  ],
}

const howToPlayGuides = [
  {
    slug: 'how-to-play-yahtzee-online',
    title: 'How to Play Yahtzee Online',
    description: 'Scoring categories, strategy tips, and how to set up a multiplayer game.',
    emoji: '🎲',
    readTime: '5 min',
    accent: 'var(--bd-sky)',
  },
  {
    slug: 'how-to-play-spy-game-online',
    title: 'How to Play Guess the Spy',
    description: 'Tips for finding the spy, bluffing, and running a great game night.',
    emoji: '🕵️',
    readTime: '4 min',
    accent: 'var(--bd-lav)',
  },
  {
    slug: 'how-to-play-memory-card-game-online',
    title: 'How to Play Memory Card Game',
    description: 'Rules, difficulty levels, and strategy for the classic matching game.',
    emoji: '🧠',
    readTime: '4 min',
    accent: 'var(--bd-mint)',
  },
  {
    slug: 'how-to-play-tic-tac-toe-online',
    title: 'How to Play Tic Tac Toe Online',
    description: 'All 8 winning lines and the strategy to never lose.',
    emoji: '⭕',
    readTime: '4 min',
    accent: 'var(--bd-coral)',
  },
  {
    slug: 'how-to-play-connect-four-online',
    title: 'How to Play Connect Four Online',
    description: 'Drop discs, get four in a row, beat your opponent. Rules and winning tips.',
    emoji: '🔴',
    readTime: '3 min',
    accent: 'var(--bd-sun)',
  },
  {
    slug: 'how-to-play-alias-online',
    title: 'How to Play Alias Online',
    description: 'Describe words, help your team guess, and score more than the other team.',
    emoji: '🗣️',
    readTime: '4 min',
    accent: 'var(--bd-coral)',
  },
]

const strategyGuides = [
  {
    slug: 'yahtzee-strategy-guide',
    title: 'Yahtzee Strategy Guide — How to Win More Often',
    description: 'When to go for Yahtzee, how to chase the bonus, and which categories to fill first.',
    emoji: '🏆',
    readTime: '6 min',
    accent: 'var(--bd-sky)',
  },
  {
    slug: 'connect-four-strategy-guide',
    title: 'Connect Four Strategy Guide — How to Win Every Time',
    description: 'Center control, double threats, and the key traps that catch most players off guard.',
    emoji: '🔴',
    readTime: '5 min',
    accent: 'var(--bd-sun)',
  },
]

const bestOfGuides = [
  {
    slug: 'best-free-multiplayer-browser-games',
    title: 'Best Free Multiplayer Browser Games in 2026',
    description: 'No download, no payment — the best games to play with friends right now.',
    emoji: '🎮',
    readTime: '4 min',
    accent: 'var(--bd-sun)',
  },
  {
    slug: 'best-2-player-games-online',
    title: 'Best 2 Player Games Online — Free, No Download',
    description: 'Tic Tac Toe, Memory, Yahtzee and more for playing with one friend.',
    emoji: '👥',
    readTime: '4 min',
    accent: 'var(--bd-sun)',
  },
  {
    slug: 'best-3-player-games-online',
    title: 'Best 3 Player Games Online — Free, No Download',
    description: 'Yahtzee, Memory, Guess the Spy — the best games for groups of three.',
    emoji: '🎮',
    readTime: '3 min',
    accent: 'var(--bd-mint)',
  },
  {
    slug: 'best-online-games-for-game-night',
    title: 'Best Online Games for Game Night',
    description: 'Five games that work for any group size — with tips for hosting online.',
    emoji: '🎉',
    readTime: '5 min',
    accent: 'var(--bd-lav)',
  },
  {
    slug: 'best-games-to-play-on-zoom',
    title: 'Best Games to Play on Zoom — Free, No Download',
    description: 'Browser games that work perfectly alongside any video call. No screen sharing needed.',
    emoji: '💻',
    readTime: '4 min',
    accent: 'var(--bd-sky)',
  },
  {
    slug: 'best-party-games-online',
    title: 'Best Party Games Online — Free to Play',
    description: 'The best online party games for groups of 4 or more — no download, no account.',
    emoji: '🎊',
    readTime: '4 min',
    accent: 'var(--bd-coral)',
  },
]

const collectionJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Board Game Guides & Tips',
  description: 'Step-by-step guides for playing board games online with friends.',
  url: 'https://boardly.online/guides',
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  hasPart: [...howToPlayGuides, ...strategyGuides, ...bestOfGuides].map(({ slug, title }) => ({
    '@type': 'Article',
    name: title,
    url: `https://boardly.online/guides/${slug}`,
  })),
}

function GuideCard({ slug, title, description, emoji, readTime, accent }: {
  slug: string; title: string; description: string; emoji: string; readTime: string; accent: string
}) {
  return (
    <Link
      href={`/guides/${slug}`}
      className="bd-card group flex flex-col gap-4 p-5 transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 text-2xl shadow-[2px_2px_0_var(--bd-ink)]"
          style={{
            borderColor: 'var(--bd-ink)',
            background: `color-mix(in srgb, ${accent} 18%, var(--bd-bg2))`,
          }}
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="mb-1 text-[15px] font-bold leading-snug group-hover:text-bd-coral"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {title}
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span
          className="rounded-lg px-2.5 py-1 text-xs font-medium"
          style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: 'var(--bd-ink-soft)' }}
        >
          {readTime} read
        </span>
        <span className="text-sm transition-colors" style={{ color: 'var(--bd-ink-muted)' }}>→</span>
      </div>
    </Link>
  )
}

export default function GuidesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />

      <div className="bd-page bd-screen flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">

          <nav className="mb-8 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label="Breadcrumb">
            <Link href="/" className="transition-colors hover:text-bd-ink">Home</Link>
            <span>/</span>
            <span style={{ color: 'var(--bd-ink)' }}>Guides</span>
          </nav>

          {/* Hero */}
          <div
            className="bd-card relative mb-10 overflow-hidden p-7 sm:p-8"
            style={{ background: 'linear-gradient(120deg, var(--bd-bg) 0%, color-mix(in srgb, var(--bd-lav) 8%, var(--bd-bg)) 100%)' }}
          >
            <div className="bd-dot-grid absolute inset-0 opacity-30" />
            <div className="relative flex items-end justify-between gap-6">
              <div>
                <span className="bd-kicker mb-2 block">Guides</span>
                <h1
                  className="mb-2 text-[clamp(28px,3.5vw,46px)] font-extrabold leading-none tracking-tight"
                  style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
                >
                  Tips & How-to-Play
                </h1>
                <p className="max-w-[420px] text-[14px]" style={{ color: 'var(--bd-ink-soft)' }}>
                  Everything you need to understand the rules, learn the strategy, and win.
                </p>
              </div>
              <div className="hidden shrink-0 sm:flex sm:gap-2">
                {['🎲', '🕵️', '🧠', '⭕'].map((e) => (
                  <span
                    key={e}
                    className="grid h-10 w-10 place-items-center rounded-xl border-2 text-lg shadow-[2px_2px_0_var(--bd-ink)]"
                    style={{ borderColor: 'var(--bd-ink)', background: 'var(--bd-sun)' }}
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* How to Play */}
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--bd-ink-muted)' }}>
                How to Play
              </h2>
              <div className="h-px flex-1" style={{ background: 'var(--bd-line)' }} />
              <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{howToPlayGuides.length} guides</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {howToPlayGuides.map((guide) => (
                <GuideCard key={guide.slug} {...guide} />
              ))}
            </div>
          </section>

          {/* Strategy */}
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--bd-ink-muted)' }}>
                Strategy
              </h2>
              <div className="h-px flex-1" style={{ background: 'var(--bd-line)' }} />
              <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{strategyGuides.length} guides</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {strategyGuides.map((guide) => (
                <GuideCard key={guide.slug} {...guide} />
              ))}
            </div>
          </section>

          {/* Best of */}
          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--bd-ink-muted)' }}>
                Best Of
              </h2>
              <div className="h-px flex-1" style={{ background: 'var(--bd-line)' }} />
              <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{bestOfGuides.length} guides</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {bestOfGuides.map((guide) => (
                <GuideCard key={guide.slug} {...guide} />
              ))}
            </div>
          </section>

        </div>
      </div>
      <Footer />
    </>
  )
}
