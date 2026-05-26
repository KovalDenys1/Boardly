import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist } from '../components/GuideLayout'

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
  alternates: { canonical: 'https://boardly.online/guides/best-2-player-games-online' },
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
    tagline: 'Best for: Quick 1v1 matches · <1 min · Pattern recognition',
    href: '/games/tic-tac-toe',
    guideHref: '/guides/how-to-play-tic-tac-toe-online',
    why: 'The fastest 2 player game online. A round takes under a minute. Play best-of-3 or best-of-5 for a real competitive series — rematch ready in seconds. Supports an AI opponent if your friend is not available.',
    tip: 'Take the center square first — it is part of 4 winning lines, more than any other cell.',
  },
  {
    rank: 2,
    emoji: '🧠',
    name: 'Memory Card Game',
    tagline: 'Best for: Competitive matching · 5–10 min · Memory & attention',
    href: '/games/memory',
    guideHref: '/guides/how-to-play-memory-card-game-online',
    why: 'Flip cards, find pairs, beat your opponent. Both players see the same board — when your opponent misses a pair, you see exactly where it is. Three difficulty levels: Easy (8 pairs), Medium (12 pairs), Hard (15 pairs).',
    tip: 'Pay attention when your opponent flips — their misses are hints for your next turn.',
  },
  {
    rank: 3,
    emoji: '🎲',
    name: 'Yahtzee',
    tagline: 'Best for: Longer strategy sessions · 15–20 min · Dice + strategy',
    href: '/games/yahtzee',
    guideHref: '/guides/how-to-play-yahtzee-online',
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

      <GuideLayout
        emoji="🎮"
        title="Best 2 Player Games Online — Free, No Download"
        subtitle="4 min read · All games free on Boardly · No account required"
        breadcrumbLabel="Best 2 Player Games Online"
        accentColor="var(--bd-lav)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Pick a game and challenge your friend now.' }}
        related={[
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
        ]}
      >
        <GuideSection title="Quick Comparison">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-xs uppercase tracking-wide"
                  style={{ borderBottom: '1px solid var(--bd-line)', color: 'var(--bd-ink-muted)' }}
                >
                  <th className="text-left py-2 pr-4">Game</th>
                  <th className="text-left py-2 pr-4">Round length</th>
                  <th className="text-left py-2">Skill type</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Tic Tac Toe', length: '<1 min', skill: 'Pattern recognition' },
                  { name: 'Memory', length: '5–10 min', skill: 'Memory & attention' },
                  { name: 'Yahtzee', length: '15–20 min', skill: 'Dice + strategy' },
                ].map(({ name, length, skill }) => (
                  <tr key={name} style={{ borderBottom: '1px solid var(--bd-line)' }}>
                    <td className="py-3 pr-4 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>{name}</td>
                    <td className="py-3 pr-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>{length}</td>
                    <td className="py-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>{skill}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GuideSection>

        <GuideSection title="The Best 2 Player Games">
          <div className="space-y-4">
            {games.map(({ rank, emoji, name, tagline, href, guideHref, why, tip }) => (
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
                </div>
                <p className="mb-1 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{tagline}</p>
                <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>{why}</p>
                <p className="mb-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                  <strong style={{ color: 'var(--bd-ink-soft)' }}>💡 Tip:</strong> {tip}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={href}
                    className="inline-flex items-center rounded-xl px-4 py-2 text-xs font-semibold transition-colors hover:text-bd-coral"
                    style={{ background: 'var(--bd-card-warm)', border: '1px solid var(--bd-line)', color: 'var(--bd-ink)' }}
                  >
                    Play {name} →
                  </Link>
                  <Link
                    href={guideHref}
                    className="inline-flex items-center rounded-xl px-4 py-2 text-xs font-semibold transition-colors"
                    style={{ border: '1px solid var(--bd-line)', color: 'var(--bd-ink-soft)' }}
                  >
                    Full guide
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Tips for Playing Online with One Friend">
          <GuideChecklist items={[
            '✅ Share the lobby link directly — no account needed for either player',
            '✅ Play on any device — desktop, mobile, and tablet all work',
            '✅ Rematch in one click — no need to set up a new game after each round',
            '✅ No time limits — play at whatever pace works for your session',
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
