import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'Connect Four Strategy Guide — How to Win Every Time',
  description:
    'Proven Connect Four strategies to beat any opponent. Learn center control, how to set up unstoppable threats, and the key traps that catch most players off guard.',
  keywords: [
    'connect four strategy',
    'how to win connect four',
    'connect four tips',
    'connect four winning strategy',
    'connect four tricks',
    'best connect four moves',
  ],
  openGraph: {
    title: 'Connect Four Strategy Guide | Boardly',
    description: 'Proven Connect Four strategies — center control, double threats, and the traps that win games.',
    url: 'https://boardly.online/guides/connect-four-strategy-guide',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/connect-four-strategy-guide' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Connect Four Strategy Guide — How to Win Every Time',
  description: 'Center control, double threats, and key traps in Connect Four.',
  url: 'https://boardly.online/guides/connect-four-strategy-guide',
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
    { '@type': 'ListItem', position: 3, name: 'Connect Four Strategy Guide', item: 'https://boardly.online/guides/connect-four-strategy-guide' },
  ],
}

export default function ConnectFourStrategyGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🔴"
        title="Connect Four Strategy Guide — How to Win Every Time"
        subtitle="5 min read · Strategy tips for all skill levels · Free on Boardly"
        breadcrumbLabel="Connect Four Strategy Guide"
        accentColor="var(--bd-sun)"
        cta={{ href: '/games/connect-four/lobbies', label: 'Play Connect Four Now', detail: 'Put these strategies to the test.' }}
        related={[
          { href: '/guides/how-to-play-connect-four-online', label: 'How to Play Connect Four Online — Full Rules' },
          { href: '/guides/yahtzee-strategy-guide', label: 'Yahtzee Strategy Guide — How to Win More Often' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
        ]}
      >
        <GuideSection title="Rule #1: Own the Center">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            The board has 7 columns. Column 4 — the middle one — is the most valuable square on the board. A disc placed there can be part of more winning lines than any other column: left-right, up-down, and both diagonals all pass through the center.
          </p>
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Your first disc should almost always go in column 4. If you play second and your opponent takes the center, play column 3 or 5 — never let them build freely from the middle.
          </p>
          <GuideChecklist items={[
            '✅ First move: always column 4 (center)',
            '✅ Second move if center is taken: columns 3 or 5',
            '⛔ Avoid the edges (columns 1 and 7) early — they connect to fewer lines',
          ]} />
        </GuideSection>

        <GuideSection title="The Double Threat — The Most Powerful Move in the Game">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            A double threat means you have two different places where dropping one more disc would win the game. Your opponent can only block one space per turn — so you win the other.
          </p>
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Setting up a double threat takes a few moves to build. The idea is to work on two different lines at the same time, so your opponent cannot block both.
          </p>
          <div className="space-y-3">
            {[
              {
                step: 'Build two lines in different directions',
                detail: 'Work on a horizontal line and a diagonal at the same time. Each move should add to one of them.',
              },
              {
                step: 'Make sure both threats need a disc in different columns',
                detail: 'If both threats need column 4, your opponent can block both with one move. Spread them out.',
              },
              {
                step: 'Watch when your opponent blocks one — play the other',
                detail: 'Once they stop one threat, complete the second immediately. If they miss it, you win.',
              },
            ].map(({ step, detail }) => (
              <div
                key={step}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>{step}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{detail}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Key Strategy Tips">
          <GuideTipList items={[
            {
              emoji: '💡',
              tip: 'Build low, not high',
              detail: 'Discs placed in the bottom rows are more flexible — they can be part of horizontal, vertical, and diagonal lines. Stacking high early limits your options and fills columns fast.',
            },
            {
              emoji: '💡',
              tip: 'Check diagonals every turn',
              detail: 'Diagonal wins are the easiest to miss because the eye naturally follows rows and columns. Before you drop a disc, scan both diagonal directions for threats you might be ignoring.',
            },
            {
              emoji: '💡',
              tip: 'Count what your block does for you',
              detail: 'When you block your opponent, make sure your blocking disc also helps your own lines. Wasting a move on a pure block with no value for yourself puts you one move behind.',
            },
            {
              emoji: '💡',
              tip: 'Think about what sits on top',
              detail: 'When a column fills up, every future disc in that column lands on top of the last. If filling a column gives your opponent a winning space on the next row, wait.',
            },
            {
              emoji: '💡',
              tip: 'Force your opponent to help you',
              detail: 'Create a threat that your opponent must block — and place that block so that it falls exactly where your next line needs a disc. You are using their moves to build your win.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Common Mistakes to Avoid">
          <GuideChecklist items={[
            '⛔ Ignoring the center — the most common beginner mistake',
            '⛔ Only blocking, never building — you cannot win by only defending',
            '⛔ Stacking discs in one column too early — fills it up and locks you out',
            '⛔ Missing diagonal threats — check them every single turn',
            '⛔ Completing a column that gives your opponent the winning space on top',
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
