import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'Best 3 Player Games Online — Free, No Download',
  description:
    'The best free online games for exactly 3 players. No download, no account — share a link and start playing in seconds. Browser games for groups of three.',
  keywords: [
    'best 3 player games online',
    '3 player games online free',
    'three player games online',
    'online games for 3 players',
    'free 3 player browser games',
    'games to play with 3 people online',
  ],
  openGraph: {
    title: 'Best 3 Player Games Online | Boardly',
    description: 'Top free browser games for groups of three — no download, no account needed.',
    url: 'https://boardly.online/guides/best-3-player-games-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/best-3-player-games-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Best 3 Player Games Online — Free, No Download',
  description: 'Top free browser games for groups of three.',
  url: 'https://boardly.online/guides/best-3-player-games-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2026-05-26',
  dateModified: '2026-05-26',
  author: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://boardly.online' },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://boardly.online/guides' },
    { '@type': 'ListItem', position: 3, name: 'Best 3 Player Games Online', item: 'https://boardly.online/guides/best-3-player-games-online' },
  ],
}

const games = [
  {
    rank: 1, emoji: '🎲', name: 'Yahtzee', players: '2–4 players', href: '/games/yahtzee',
    why: 'Three-player Yahtzee hits a perfect balance — enough competition that every point matters, but short enough that a full game wraps up in 20–25 minutes. All three players see the same scorecard, so everyone knows exactly where they stand.',
    best: 'Longer sessions, competitive groups, dice strategy fans',
  },
  {
    rank: 2, emoji: '🧠', name: 'Memory Card Game', players: '2–4 players', href: '/games/memory',
    why: 'With three players, the card positions change fast — what you saw on one player\'s turn might be gone by the time it is yours. Keeps everyone focused the whole game. Choose from three grid sizes depending on how long you want to play.',
    best: 'Quick rounds, casual games, any age group',
  },
  {
    rank: 3, emoji: '🕵️', name: 'Guess the Spy', players: '3–10 players', href: '/games/spy',
    why: 'Three is the minimum for Guess the Spy, and it works surprisingly well. With fewer players, every question matters more and the spy has nowhere to hide. Rounds are short — 5–8 minutes — so you can play several in a row.',
    best: 'When you want something social and quick, 3 works great',
  },
]

export default function Best3PlayerGamesGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🎮"
        title="Best 3 Player Games Online — Free, No Download"
        subtitle="3 min read · All games free on Boardly · No account required"
        breadcrumbLabel="Best 3 Player Games Online"
        accentColor="var(--bd-mint)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Pick a game, share the link, and start in seconds.' }}
        related={[
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
          { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
        ]}
      >
        <GuideSection title="What You Need">
          <GuideChecklist items={[
            '✅ 3 players — everyone in their own browser tab',
            '✅ Desktop, tablet, or mobile — all work',
            '✅ No account required for any player',
            '✅ Free — no ads, no download',
          ]} />
        </GuideSection>

        <GuideSection title="The Best Games for 3 Players">
          <div className="space-y-4">
            {games.map(({ rank, emoji, name, players, href, why, best }) => (
              <div
                key={name}
                className="rounded-2xl border p-5"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-[1px_1px_0_var(--bd-ink)]"
                    style={{ borderColor: 'var(--bd-ink)', background: 'var(--bd-sun)', color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
                  >
                    {rank}
                  </span>
                  <span className="text-xl">{emoji}</span>
                  <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{name}</strong>
                  <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{players}</span>
                </div>
                <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>{why}</p>
                <p className="mb-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                  <strong style={{ color: 'var(--bd-ink-soft)' }}>Best for:</strong> {best}
                </p>
                <Link
                  href={href}
                  className="inline-flex items-center rounded-xl px-4 py-2 text-xs font-semibold transition-colors hover:text-bd-coral"
                  style={{ background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                >
                  Play {name} →
                </Link>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Why 3 Players Is a Great Group Size">
          <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Three players is a sweet spot for a lot of games. There is enough competition to make every move count, but the group is small enough that rounds stay fast and nobody spends too long waiting for their turn.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Games like Yahtzee and Memory play well at three because the third player creates a genuine three-way race — nobody can ignore what the others are doing. And if you want something more social, Guess the Spy works at three, though it gets even better as the group grows.
          </p>
        </GuideSection>
      </GuideLayout>
    </>
  )
}
