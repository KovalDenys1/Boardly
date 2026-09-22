import type { Metadata } from 'next'
import { buildGuideMetadata, buildGuideArticleJsonLd, buildGuideBreadcrumbJsonLd } from '@/lib/guide-seo'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideSteps, GuideChecklist } from '../components/GuideLayout'

export const metadata: Metadata = buildGuideMetadata('yahtzee-strategy-guide')

const articleJsonLd = buildGuideArticleJsonLd('yahtzee-strategy-guide')

const breadcrumbJsonLd = buildGuideBreadcrumbJsonLd('yahtzee-strategy-guide')

export default function YahtzeeStrategyGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <GuideLayout
        icon={{ glyph: 'trophy' }}
        slug="yahtzee-strategy-guide"
        title="Yahtzee Strategy Guide — How to Win More Often"
        subtitle="6 min read · Strategy tips for all skill levels · Free on Boardly"
        question="What is the best strategy for winning at Yahtzee?"
        answer="Protect the 35-point upper bonus first, treat the low-value categories as the place to put a bad roll rather than something to chase, and decide what to keep by what the whole scorecard still needs – not by what this one roll looks like."
        accentColor="var(--bd-sky)"
        cta={{ href: '/games/yahtzee/lobbies', label: 'Play Yahtzee Now', detail: 'Put these strategies to the test.' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online — Full Rules' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/connect-four-strategy-guide', label: 'Connect Four Strategy Guide — How to Win Every Time' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
        ]}
      >
        <GuideSection title="The Most Important Rule: Chase the Bonus">
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            The single biggest thing separating winning players from losing ones is the upper section bonus. If your scores for Aces, Twos, Threes, Fours, Fives, and Sixes add up to 63 or more, you get an extra 35 points — that is a huge number in a game where scores usually land between 200 and 300.
          </p>
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            If the categories are new to you, read <Link href="/guides/how-to-play-yahtzee-online" className="font-semibold underline transition-colors hover:text-bd-coral" style={{ color: 'var(--bd-ink)' }}>how to play Yahtzee online</Link> first. The bonus, short mode and the turn timer are all described on the <Link href="/games/yahtzee" className="font-semibold underline transition-colors hover:text-bd-coral" style={{ color: 'var(--bd-ink)' }}>Yahtzee game page</Link>.
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
            A Yahtzee scores a flat 50 points and the box fills once. Boardly pays no bonus for a second five of a kind – it has to be scored somewhere else, usually Four of a Kind or Chance. Fifty is still the largest single number on the card, so it is worth chasing, but only from a position that was already going to pay.
          </p>
          <GuideChecklist verdict items={[
            { mark: 'yes', text: 'Go for it — you have 4 of the same number after your first roll' },
            { mark: 'yes', text: 'Go for it — you have 3 of the same number and two rolls left' },
            { mark: 'no', text: 'Do not bother — you have 3 of the same number but only one roll left' },
            { mark: 'no', text: 'Do not bother — you also need the upper section bonus for that number' },
          ]} />
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            Keep in mind: once the Yahtzee box is filled – with 50 or with a zero – five of a kind earns nothing extra. Score it as Four of a Kind or Chance, which both take the sum of all five dice, and spend the rest of the game on the bonus instead.
          </p>
        </GuideSection>

        <GuideSection title="Which Categories to Fill First">
          <GuideSteps steps={[
            {
              title: 'Fill Aces and Twos early with bad rolls',
              detail: 'When you roll junk — nothing useful across the board — put the score in Aces or Twos. They are low-value categories worth 3–6 points anyway. Taking a zero here is worse than taking a small score.',
            },
            {
              title: 'Save Chance for desperate turns',
              detail: 'Chance scores the sum of all five dice. It has no requirement — any roll qualifies. Save it for turns where nothing fits anywhere else. A good Chance score is 20 or more.',
            },
            {
              title: 'Use Large Straight before Small Straight',
              detail: 'Large Straight (5 dice in order, 40 points) is worth 10 more than Small Straight (4 dice in order, 30 points). If you roll four dice in order, keep going for five before settling for the smaller score.',
            },
            {
              title: 'Full House is reliable mid-game',
              detail: 'Full House (three of one number + two of another, 25 points) is not the highest score, but it is consistent to get. Fill it in the middle of the game when you have a decent roll that does not fit anything better.',
            },
            {
              title: 'Lock in Four of a Kind when you see it',
              detail: 'Four of a Kind scores the sum of all five dice, so four sixes plus any other die is at least 25 points. Do not re-roll hoping for five — the risk is not worth it unless your Yahtzee box is still open.',
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
            { text: 'After roll 1: identify your best path (three of a kind? straight? bonus category?)' },
            { text: 'After roll 2: commit to one goal and re-roll everything that does not support it' },
            { text: 'Before scoring: check if any category gives you more points than you expect' },
            { text: 'Always: track where you are vs the 63-point bonus threshold' },
          ]} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
