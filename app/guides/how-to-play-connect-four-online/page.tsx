import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'How to Play Connect Four Online - Complete Guide',
  description:
    'Learn how to play Connect Four online. Simple rules, winning patterns, and tips to beat your opponent every time. Free 2-player game in your browser.',
  keywords: [
    'how to play connect four online',
    'connect four rules',
    'connect four strategy',
    'play connect four with friends',
    'connect four online free',
  ],
  openGraph: {
    title: 'How to Play Connect Four Online | Boardly',
    description: 'Complete Connect Four guide — rules, winning patterns, and strategy tips. Free 2-player game in your browser.',
    url: 'https://boardly.online/guides/how-to-play-connect-four-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/how-to-play-connect-four-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Connect Four Online — Complete Guide',
  description: 'Rules, winning patterns, and strategy for Connect Four.',
  url: 'https://boardly.online/guides/how-to-play-connect-four-online',
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
    { '@type': 'ListItem', position: 3, name: 'How to Play Connect Four Online', item: 'https://boardly.online/guides/how-to-play-connect-four-online' },
  ],
}

export default function HowToPlayConnectFourGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🔴"
        title="How to Play Connect Four Online"
        subtitle="3 min read · Free to play on Boardly · 2 players or vs AI"
        breadcrumbLabel="How to Play Connect Four Online"
        accentColor="var(--bd-sun)"
        cta={{ href: '/games/connect-four/lobbies', label: 'Play Connect Four Now', detail: 'Ready to drop your first disc?' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
        ]}
      >
        <GuideSection title="What You Need">
          <GuideChecklist items={[
            '✅ 2 players — or play solo against AI',
            '✅ A browser — desktop, tablet, or mobile',
            '✅ No account required (guest play available)',
            '✅ Free — no ads, no download',
          ]} />
        </GuideSection>

        <GuideSection title="The Rules">
          <GuideSteps steps={[
            {
              title: 'The board',
              detail: 'The board has 7 columns and 6 rows. One player uses red discs, the other uses yellow.',
            },
            {
              title: 'Take turns dropping a disc',
              detail: 'On your turn, pick any column and drop your disc in. It falls to the lowest empty row in that column.',
            },
            {
              title: 'Get four in a row to win',
              detail: 'Connect four of your discs in a straight line — left to right, top to bottom, or diagonally. First to do it wins.',
            },
            {
              title: 'Draw',
              detail: 'If all 42 spaces fill up and nobody has four in a row, the game ends in a draw.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Winning Directions">
          <p className="mb-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            Four in a row counts in any of these directions:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Left to right', icon: '→' },
              { label: 'Top to bottom', icon: '↓' },
              { label: 'Diagonal ↘', icon: '↘' },
              { label: 'Diagonal ↙', icon: '↙' },
            ].map(({ label, icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
              >
                <span className="text-base">{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Strategy Tips">
          <GuideTipList items={[
            {
              emoji: '💡',
              tip: 'Start in the middle column',
              detail: 'The center column (column 4) touches more winning lines than any other. Drop your first disc there — it gives you the most options.',
            },
            {
              emoji: '💡',
              tip: 'Build from the bottom',
              detail: 'Stacking discs high early limits your options. Build your lines low first — the board fills up fast and low pieces are harder to block.',
            },
            {
              emoji: '💡',
              tip: 'Watch the diagonals',
              detail: 'Diagonal wins are the easiest to miss. Before you drop a disc, check if you are accidentally helping your opponent complete a diagonal line.',
            },
            {
              emoji: '💡',
              tip: 'Set up two threats at once',
              detail: 'If you can create a situation where you have two different ways to win, your opponent can only block one. This wins almost every time.',
            },
            {
              emoji: '💡',
              tip: 'Do not fill a column prematurely',
              detail: 'Once a column is full, it is gone. If filling a column gives your opponent a winning space on top, avoid it until the time is right.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Playing on Boardly">
          <div className="space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs AI:</strong> Play solo at any time. Great for practicing before challenging a friend.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs Friend:</strong> Share a lobby link — your friend joins in seconds, no account needed.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Turn timer:</strong> Optional countdown keeps the game moving. Choose 30, 60, 90, or 120 seconds per turn.</p>
          </div>
        </GuideSection>
      </GuideLayout>
    </>
  )
}
