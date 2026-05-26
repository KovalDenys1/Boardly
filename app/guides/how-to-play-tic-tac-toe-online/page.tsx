import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'How to Play Tic Tac Toe Online - Complete Guide',
  description:
    'Complete Tic Tac Toe guide — rules, all 8 winning lines, and strategies to never lose. Free vs AI or 2 players.',
  keywords: [
    'how to play tic tac toe online',
    'tic tac toe rules',
    'noughts and crosses guide',
    'tic tac toe strategy',
    'play tic tac toe with friends',
  ],
  openGraph: {
    title: 'How to Play Tic Tac Toe Online | Boardly',
    description: 'Complete Tic Tac Toe guide — rules, winning lines, and never-lose strategy. Free vs AI or 2 players.',
    url: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Tic Tac Toe Online — Complete Guide',
  description: 'Rules, winning lines, and strategy for Tic Tac Toe.',
  url: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online',
  image: 'https://boardly.online/opengraph-image',
  datePublished: '2025-01-01',
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
    { '@type': 'ListItem', position: 3, name: 'How to Play Tic Tac Toe Online', item: 'https://boardly.online/guides/how-to-play-tic-tac-toe-online' },
  ],
}

export default function HowToPlayTicTacToeGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="⭕"
        title="How to Play Tic Tac Toe Online"
        subtitle="4 min read · Free to play on Boardly · 2 players or vs AI"
        breadcrumbLabel="How to Play Tic Tac Toe Online"
        accentColor="var(--bd-coral)"
        cta={{ href: '/games/tic-tac-toe/lobbies', label: 'Play Tic Tac Toe Now', detail: 'Ready to put your strategy to the test?' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
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
            { title: 'Choose your mark', detail: 'One player is X, the other is O. X always goes first.' },
            { title: 'Take turns', detail: 'Players alternate placing their mark in any empty cell on the 3×3 grid.' },
            { title: 'Win with three in a row', detail: 'Get three of your marks in a row — horizontally, vertically, or diagonally — and you win.' },
            { title: 'Draw', detail: 'If all 9 cells are filled and neither player has three in a row, the game is a draw. With perfect play from both sides, every game ends in a draw.' },
          ]} />
        </GuideSection>

        <GuideSection title="All 8 Winning Lines">
          <p className="mb-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            There are exactly 8 ways to win. Three in any of these lines wins the game:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              'Top row (1-2-3)',
              'Middle row (4-5-6)',
              'Bottom row (7-8-9)',
              'Left column (1-4-7)',
              'Middle column (2-5-8)',
              'Right column (3-6-9)',
              'Diagonal (1-5-9)',
              'Diagonal (3-5-7)',
            ].map((line) => (
              <div
                key={line}
                className="rounded-xl border px-3 py-2 text-xs font-medium"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
              >
                {line}
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Strategy — How to Never Lose">
          <GuideTipList items={[
            { emoji: '💡', tip: 'Start in the center (as X)', detail: 'The center square is part of 4 winning lines — more than any other cell. Taking it first gives you the most winning options.' },
            { emoji: '💡', tip: 'Take a corner if center is taken', detail: 'Corners are each part of 3 winning lines. If your opponent takes center, play a corner to set up diagonal threats.' },
            { emoji: '💡', tip: 'Block before attacking', detail: 'If your opponent has two in a row, block the third cell immediately. Missing a block almost always loses the game.' },
            { emoji: '💡', tip: 'Create a fork', detail: 'A fork means two different ways to win at once. Your opponent can only block one, so you win the other.' },
            { emoji: '💡', tip: 'Block forks', detail: "If your opponent is setting up a fork, block it — either by playing the cell they need, or by creating a threat that forces them to defend elsewhere." },
          ]} />
        </GuideSection>

        <GuideSection title="Playing on Boardly">
          <div className="space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs AI:</strong> Play solo against a bot — great for practising strategy without waiting for an opponent.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs Friend:</strong> Share a lobby link and play in real time. No account needed for either player.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Match mode:</strong> Play a series of rounds to determine the overall winner — best of 3 or best of 5.</p>
          </div>
        </GuideSection>
      </GuideLayout>
    </>
  )
}
