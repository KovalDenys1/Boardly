import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'How to Play Memory Card Game Online - Complete Guide',
  description:
    'Rules, difficulty levels, and strategy tips for the classic card-matching game. Free multiplayer in your browser.',
  keywords: [
    'how to play memory card game online',
    'memory game rules',
    'concentration card game guide',
    'memory game strategy',
    'play memory with friends online',
  ],
  openGraph: {
    title: 'How to Play Memory Card Game Online | Boardly',
    description: 'Complete Memory guide — rules, difficulty levels, strategy tips. Free 2–4 player game in your browser.',
    url: 'https://boardly.online/guides/how-to-play-memory-card-game-online',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/how-to-play-memory-card-game-online' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Play Memory Card Game Online — Complete Guide',
  description: 'Rules, difficulty levels, and strategy tips for Memory.',
  url: 'https://boardly.online/guides/how-to-play-memory-card-game-online',
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
    { '@type': 'ListItem', position: 3, name: 'How to Play Memory Card Game', item: 'https://boardly.online/guides/how-to-play-memory-card-game-online' },
  ],
}

export default function HowToPlayMemoryGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🧠"
        title="How to Play Memory Card Game Online"
        subtitle="4 min read · Free to play on Boardly · 2–4 players"
        breadcrumbLabel="How to Play Memory Card Game"
        accentColor="var(--bd-mint)"
        cta={{ href: '/games/memory/lobbies', label: 'Play Memory Now', detail: 'Ready to test your memory?' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
        ]}
      >
        <GuideSection title="What You Need">
          <GuideChecklist items={[
            '✅ 2–4 players',
            '✅ A browser — desktop, tablet, or mobile',
            '✅ No account required (guest play available)',
            '✅ Free — no ads, no download',
          ]} />
        </GuideSection>

        <GuideSection title="How to Play — Step by Step">
          <GuideSteps steps={[
            { title: 'Start the game', detail: 'All cards are placed face-down in a grid. The grid size depends on the difficulty level you chose.' },
            { title: 'Flip two cards', detail: 'On your turn, click any card to reveal it, then click a second card. Both cards are visible to all players for a moment.' },
            { title: 'Match or miss', detail: "If the two cards match, you score a pair and get another turn. If they don't match, both flip back face-down and it's the next player's turn." },
            { title: 'Remember positions', detail: 'This is the skill — memorize where unmatched cards are so you can complete pairs on future turns.' },
            { title: 'Win the game', detail: 'When all pairs are found, the player with the most matches wins.' },
          ]} />
        </GuideSection>

        <GuideSection title="Difficulty Levels">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Boardly Memory has three difficulty levels that change the grid size and number of pairs.
          </p>
          <div className="space-y-3">
            {[
              { level: 'Easy', grid: '4×4', pairs: '8 pairs', best: 'Quick games, playing with younger players, or learning the game' },
              { level: 'Medium', grid: '4×6', pairs: '12 pairs', best: 'Standard competitive play — the sweet spot for most groups' },
              { level: 'Hard', grid: '5×6', pairs: '15 pairs', best: 'Serious players who want a longer, more demanding game' },
            ].map(({ level, grid, pairs, best }) => (
              <div
                key={level}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <strong className="text-sm" style={{ color: 'var(--bd-ink)' }}>{level}</strong>
                  <span className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>{grid} grid · {pairs}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{best}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Strategy Tips">
          <GuideTipList items={[
            { emoji: '💡', tip: 'Scan before you click', detail: "Don't rush your first flip. Systematic scanning beats random clicking every time." },
            { emoji: '💡', tip: 'Use the grid like a map', detail: 'Mentally divide the grid into sections. Clear one section at a time — easier to track positions.' },
            { emoji: '💡', tip: 'Watch your opponents', detail: "When other players flip cards, you see them too. Their misses are hints about where pairs are hiding." },
            { emoji: '💡', tip: 'Delay taking easy pairs', detail: "Once you know where a pair is, you don't have to grab it immediately — flipping a new card first gets you more information." },
            { emoji: '💡', tip: 'Go for streaks', detail: "Consecutive matches give you extra turns. On a streak, prioritize pairs you're sure about over guesses." },
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
