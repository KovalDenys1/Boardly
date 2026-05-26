import type { Metadata } from 'next'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist } from '../components/GuideLayout'

export const metadata: Metadata = {
  title: 'Yahtzee Strategy Guide — How to Win More Often',
  description:
    'Proven Yahtzee strategies to boost your score every game. Learn when to go for Yahtzee, how to chase the bonus, and which categories to fill first.',
  keywords: [
    'yahtzee strategy',
    'how to win at yahtzee',
    'yahtzee tips',
    'yahtzee scoring strategy',
    'best yahtzee strategy',
    'yahtzee category order',
  ],
  openGraph: {
    title: 'Yahtzee Strategy Guide | Boardly',
    description: 'Proven Yahtzee strategies — when to go for Yahtzee, how to chase the bonus, and which categories to fill first.',
    url: 'https://boardly.online/guides/yahtzee-strategy-guide',
    type: 'article',
  },
  alternates: { canonical: 'https://boardly.online/guides/yahtzee-strategy-guide' },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Yahtzee Strategy Guide — How to Win More Often',
  description: 'Proven Yahtzee strategies: upper section bonus, category order, when to go for Yahtzee.',
  url: 'https://boardly.online/guides/yahtzee-strategy-guide',
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
    { '@type': 'ListItem', position: 3, name: 'Yahtzee Strategy Guide', item: 'https://boardly.online/guides/yahtzee-strategy-guide' },
  ],
}

export default function YahtzeeStrategyGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        emoji="🎲"
        title="Yahtzee Strategy Guide — How to Win More Often"
        subtitle="6 min read · Strategy tips for all skill levels · Free on Boardly"
        breadcrumbLabel="Yahtzee Strategy Guide"
        accentColor="var(--bd-sky)"
        cta={{ href: '/games/yahtzee/lobbies', label: 'Play Yahtzee Now', detail: 'Put these strategies to the test.' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online — Full Rules' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/best-free-multiplayer-browser-games', label: 'Best Free Multiplayer Browser Games in 2026' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
        ]}
      >
        <GuideSection title="The Most Important Rule: Chase the Bonus">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            The single biggest thing separating winning players from losing ones is the upper section bonus. If your scores for Aces, Twos, Threes, Fours, Fives, and Sixes add up to 63 or more, you get an extra 35 points — that is a huge number in a game where scores usually land between 200 and 300.
          </p>
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            To hit 63, you need to average at least three of each number per category. That means:
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { cat: 'Aces (1s)', target: '3 pts' },
              { cat: 'Twos (2s)', target: '6 pts' },
              { cat: 'Threes (3s)', target: '9 pts' },
              { cat: 'Fours (4s)', target: '12 pts' },
              { cat: 'Fives (5s)', target: '15 pts' },
              { cat: 'Sixes (6s)', target: '18 pts' },
            ].map(({ cat, target }) => (
              <div
                key={cat}
                className="rounded-xl border px-3 py-2 text-xs"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
              >
                <div className="font-semibold" style={{ color: 'var(--bd-ink)' }}>{cat}</div>
                <div>target: {target}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            If you are below target in a category, try for it again on later turns. If you overshoot (say, four sixes instead of three), that extra point offsets a weaker category elsewhere.
          </p>
        </GuideSection>

        <GuideSection title="Going for Yahtzee — When It Is Worth It">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            A Yahtzee scores 50 points, and each extra Yahtzee after the first scores 100 bonus points on top. That makes it one of the highest-value plays in the game — but only if you know when to chase it.
          </p>
          <GuideChecklist items={[
            '✅ Go for it — you have 4 of the same number after your first roll',
            '✅ Go for it — you have 3 of the same number and two rolls left',
            '⛔ Do not bother — you have 3 of the same number but only one roll left',
            '⛔ Do not bother — you also need the upper section bonus for that number',
          ]} />
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Keep in mind: if the Yahtzee box is already filled with a zero, extra Yahtzees still earn you 100 bonus points each. So never give up on rolling five of a kind.
          </p>
        </GuideSection>

        <GuideSection title="Which Categories to Fill First">
          <GuideTipList items={[
            {
              emoji: '1️⃣',
              tip: 'Fill Aces and Twos early with bad rolls',
              detail: 'When you roll junk — nothing useful across the board — put the score in Aces or Twos. They are low-value categories worth 3–6 points anyway. Taking a zero here is worse than taking a small score.',
            },
            {
              emoji: '2️⃣',
              tip: 'Save Chance for desperate turns',
              detail: 'Chance scores the sum of all five dice. It has no requirement — any roll qualifies. Save it for turns where nothing fits anywhere else. A good Chance score is 20 or more.',
            },
            {
              emoji: '3️⃣',
              tip: 'Use Large Straight before Small Straight',
              detail: 'Large Straight (5 dice in order, 40 points) is worth 10 more than Small Straight (4 dice in order, 30 points). If you roll four dice in order, keep going for five before settling for the smaller score.',
            },
            {
              emoji: '4️⃣',
              tip: 'Full House is reliable mid-game',
              detail: 'Full House (three of one number + two of another, 25 points) is not the highest score, but it is consistent to get. Fill it in the middle of the game when you have a decent roll that does not fit anything better.',
            },
            {
              emoji: '5️⃣',
              tip: 'Lock in Four of a Kind when you see it',
              detail: 'Four of a Kind scores the total of all five dice. Four sixes plus any other die is at least 26 points. Do not re-roll hoping for five — the risk is not worth it unless your Yahtzee box is still open.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="What to Keep and Re-Roll">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            After your first roll, use this simple rule: keep the dice that support your best scoring path and re-roll everything else.
          </p>
          <div className="space-y-3">
            {[
              {
                roll: 'Three or more of the same number',
                keep: 'Keep all matching dice. Re-roll the rest. You are one step from Four of a Kind or Yahtzee.',
              },
              {
                roll: 'Four dice in a row (like 2-3-4-5)',
                keep: 'Keep all four. Re-roll the one that does not fit. You are one roll from Large Straight.',
              },
              {
                roll: 'Two pairs (like 3-3-5-5-1)',
                keep: 'Keep both pairs, re-roll the odd one. You might hit Full House — three of one, two of another.',
              },
              {
                roll: 'Random mix, nothing useful',
                keep: 'Keep the highest individual die (or two if they match). Re-roll the rest. Consider using this turn for Aces or Chance.',
              },
            ].map(({ roll, keep }) => (
              <div
                key={roll}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)' }}
              >
                <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>If you roll: {roll}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>{keep}</p>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Quick Checklist for Every Turn">
          <GuideChecklist items={[
            '🎲 After roll 1: identify your best path (three of a kind? straight? bonus category?)',
            '🎲 After roll 2: commit to one goal and re-roll everything that does not support it',
            '🎲 Before scoring: check if any category gives you more points than you expect',
            '🎲 Always: track where you are vs the 63-point bonus threshold',
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
