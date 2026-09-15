import type { Metadata } from 'next'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideChecklist, GuideFaqList, type GuideFaqItem } from '../components/GuideLayout'
import { getGuideBySlug } from '@/lib/guides-catalog'
import GameIcon from '@/components/GameIcon'

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
  dateModified: getGuideBySlug('best-2-player-games-online').updated,
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

/**
 * Rendered by `GuideFaqList` below and fed to the FAQPage schema from the same
 * array. Until #923 the schema was here and the answers were on no part of the
 * page, which is what Google calls hidden structured data.
 */
const faq: GuideFaqItem[] = [
  {
    question: 'What are the best free 2 player games online?',
    answer: 'Tic Tac Toe for a one-minute round, Memory when you want a real contest of attention, Connect Four for something tactical that still ends fast, and Yahtzee when you have twenty minutes. All four are free on Boardly, in the browser, with no download and no account.',
  },
  {
    question: 'Can I play 2 player games online for free with no download?',
    answer: 'Yes. Every game here runs in the browser on desktop, tablet and mobile. One player opens a lobby, shares the link, and the second player is in the same game a few seconds later – there is nothing to install on either side.',
  },
  {
    question: 'What is the best quick 2 player game online?',
    answer: 'Tic Tac Toe. A single round is under a minute, and best-of-three or best-of-five still fits inside five. Connect Four is the next step up: the same one-screen simplicity, a real decision on every move, and rounds under five minutes.',
  },
  {
    question: 'What 2 player online game is best for competing with a friend?',
    answer: 'Memory, because both players look at the same board and nothing is hidden from one of you – the winner is whoever paid more attention. Yahtzee is the better pick for a longer session, where category choices matter more than any single roll.',
  },
  {
    question: 'Do both players need an account to play?',
    answer: 'No. Neither player needs one. One of you creates the lobby, shares the link, and the other joins as a guest by typing a name. An account only adds a saved profile and stats.',
  },
  {
    question: 'Can I play on my own if my friend is not around?',
    answer: 'Tic Tac Toe and Connect Four both have a bot with three difficulty levels, so a solo round is always available. Memory and Yahtzee can be played solo as practice, but they are built for a second person on the other side of the board.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
}

const games = [
  {
    rank: 1,
    gameId: 'tic-tac-toe',
    accent: 'var(--bd-coral)',
    name: 'Tic Tac Toe',
    tagline: 'Best for: Quick 1v1 matches · <1 min · Pattern recognition',
    href: '/games/tic-tac-toe',
    guideHref: '/guides/how-to-play-tic-tac-toe-online',
    why: 'The fastest 2 player game online. A round takes under a minute. Play best-of-3 or best-of-5 for a real competitive series — rematch ready in seconds. Supports an AI opponent if your friend is not available.',
    tip: 'Take the center square first — it is part of 4 winning lines, more than any other cell.',
  },
  {
    rank: 2,
    gameId: 'memory',
    accent: 'var(--bd-mint)',
    name: 'Memory Card Game',
    tagline: 'Best for: Competitive matching · 5–10 min · Memory & attention',
    href: '/games/memory',
    guideHref: '/guides/how-to-play-memory-card-game-online',
    why: 'Flip cards, find pairs, beat your opponent. Both players see the same board — when your opponent misses a pair, you see exactly where it is. Three difficulty levels: Easy (8 pairs), Medium (12 pairs), Hard (15 pairs).',
    tip: 'Pay attention when your opponent flips — their misses are hints for your next turn.',
  },
  {
    rank: 3,
    gameId: 'connect-four',
    accent: 'var(--bd-sun)',
    name: 'Connect Four',
    tagline: 'Best for: Tactical head to head · 3–5 min · Planning ahead',
    href: '/games/connect-four',
    guideHref: '/guides/how-to-play-connect-four-online',
    why: 'The only game in the catalogue built for exactly two people. Drop a disc, block your opponent, get four in a row. It is the shortest game here that still punishes a careless move, which makes it the best of the four for a long rematch series.',
    tip: 'Play the middle column first – it belongs to more winning lines than any other column on the board.',
  },
  {
    rank: 4,
    gameId: 'yahtzee',
    accent: 'var(--bd-sky)',
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
        icon={{ glyph: 'users' }}
        slug="best-2-player-games-online"
        title="Best 2 Player Games Online — Free, No Download"
        subtitle="5 min read · All games free on Boardly · No account required"
        question="What are the best 2 player games to play online?"
        answer="Tic Tac Toe for a round that ends in under a minute, Connect Four for something tactical that still ends fast, Memory for a close contest of attention, and Yahtzee when you have twenty minutes – all four free in the browser, with no download and no account for either player."
        breadcrumbLabel="Best 2 Player Games Online"
        accentColor="var(--bd-lav)"
        cta={{ href: '/games', label: 'Browse All Games', detail: 'Pick a game and challenge your friend now.' }}
        related={[
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
          { href: '/guides/how-to-play-connect-four-online', label: 'How to Play Connect Four Online' },
          { href: '/guides/connect-four-strategy-guide', label: 'Connect Four Strategy Guide — How to Win Every Time' },
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
                  { name: 'Connect Four', length: '3–5 min', skill: 'Planning ahead' },
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
            {games.map(({ rank, gameId, accent, name, tagline, href, guideHref, why, tip }) => (
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
                  <GameIcon gameId={gameId} accentColor={accent} size={22} variant="bare" />
                  <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{name}</strong>
                </div>
                <p className="mb-1 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{tagline}</p>
                <p className="mb-2 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>{why}</p>
                <p className="mb-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
                  <strong style={{ color: 'var(--bd-ink-soft)' }}>Tip:</strong> {tip}
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
            { mark: 'yes', text: 'Share the lobby link directly — no account needed for either player' },
            { mark: 'yes', text: 'Play on any device — desktop, mobile, and tablet all work' },
            { mark: 'yes', text: 'Rematch in one click — no need to set up a new game after each round' },
            { mark: 'yes', text: 'No time limits — play at whatever pace works for your session' },
          ]} />
        </GuideSection>

        <GuideSection title="2 Player Games: Common Questions">
          <GuideFaqList items={faq} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
