import type { Metadata } from 'next'
import { buildGuideMetadata, buildGuideArticleJsonLd, buildGuideBreadcrumbJsonLd } from '@/lib/guide-seo'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps, GuideFaqList, buildGuideFaqJsonLd, type GuideFaqItem } from '../components/GuideLayout'
import { Icon } from '@/components/icons'

export const metadata: Metadata = buildGuideMetadata('how-to-play-connect-four-online')

const articleJsonLd = buildGuideArticleJsonLd('how-to-play-connect-four-online')

const breadcrumbJsonLd = buildGuideBreadcrumbJsonLd('how-to-play-connect-four-online')

/**
 * Rendered by `GuideFaqList` below and fed to the FAQPage schema from the same
 * array (#964), so the markup can never describe a question the page does not
 * show.
 */
const faq: GuideFaqItem[] = [
  {
    question: 'How big is the Connect Four board?',
    answer: 'Seven columns by six rows, 42 spaces in all. You choose a column rather than a square, and the disc falls to the lowest empty row in it – which is why the move you would like to make is often not available yet.',
  },
  {
    question: 'Who goes first, and does it matter?',
    answer: 'The lobby host plays first, and keeps the opening move in every round of a series. It matters: with perfect play the first player wins, which is why the opening move in the middle column is worth so much. If you want an even series, swap who creates the lobby.',
  },
  {
    question: 'What happens if the board fills up?',
    answer: 'If all 42 spaces are taken and nobody has four in a row, the game is a draw and neither player scores. Draws are rare between players of different strength and common between two careful ones.',
  },
  {
    question: 'Can I play Connect Four against the computer?',
    answer: 'Yes, on three difficulty levels. The easy bot drops into a random open column, and the hard one searches six moves ahead and will punish a column you drop without checking the diagonals.',
  },
  {
    question: 'Is there a time limit on a turn?',
    answer: 'Yes, on every turn. The host picks 30, 60, 90 or 120 seconds when creating the lobby and 60 is the default, but there is no setting that turns the clock off. Letting it run out forfeits the round, so it is worth watching even on the long settings.',
  },
  {
    question: 'Do diagonal lines count?',
    answer: 'Yes, in both directions, and they are what most lost games come down to. A vertical or horizontal threat is easy to see; a diagonal builds one disc at a time across four different columns and is easy to miss.',
  },
]

const faqJsonLd = buildGuideFaqJsonLd(faq)

export default function HowToPlayConnectFourGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <GuideLayout
        icon={{ game: 'connect-four' }}
        slug="how-to-play-connect-four-online"
        title="How to Play Connect Four Online"
        subtitle="5 min read · Free to play on Boardly · 2 players or vs AI"
        question="How do you play Connect Four online?"
        answer="Two players take turns dropping a disc into one of seven columns, where it falls to the lowest free row, and the first to line up four of their own colour – across, up, or along a diagonal – wins."
        accentColor="var(--bd-sun)"
        cta={{ href: '/games/connect-four/lobbies', label: 'Play Connect Four Now', detail: 'Ready to drop your first disc?' }}
        related={[
          { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
          { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
          { href: '/guides/connect-four-strategy-guide', label: 'Connect Four Strategy Guide — How to Win Every Time' },
        ]}
      >
        <GuideSection title="What You Need">
          <GuideChecklist items={[
            { mark: 'yes', text: '2 players — or play solo against AI' },
            { mark: 'yes', text: 'A browser — desktop, tablet, or mobile' },
            { mark: 'yes', text: 'No account required (guest play available)' },
            { mark: 'yes', text: 'Free — no ads, no download' },
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
              { label: 'Left to right', rotate: 0 },
              { label: 'Top to bottom', rotate: 90 },
              { label: 'Diagonal down-right', rotate: 45 },
              { label: 'Diagonal down-left', rotate: 135 },
            ].map(({ label, rotate }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
                style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
              >
                <Icon name="arrow-right" size={16} weight="bold" style={{ transform: `rotate(${rotate}deg)` }} />
                {label}
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection title="Strategy Tips">
          <GuideTipList items={[
            {

              tip: 'Start in the middle column',
              detail: 'The center column (column 4) touches more winning lines than any other. Drop your first disc there — it gives you the most options.',
            },
            {

              tip: 'Build from the bottom',
              detail: 'Stacking discs high early limits your options. Build your lines low first — the board fills up fast and low pieces are harder to block.',
            },
            {

              tip: 'Watch the diagonals',
              detail: 'Diagonal wins are the easiest to miss. Before you drop a disc, check if you are accidentally helping your opponent complete a diagonal line.',
            },
            {

              tip: 'Set up two threats at once',
              detail: 'If you can create a situation where you have two different ways to win, your opponent can only block one. This wins almost every time.',
            },
            {

              tip: 'Do not fill a column prematurely',
              detail: 'Once a column is full, it is gone. If filling a column gives your opponent a winning space on top, avoid it until the time is right.',
            },
          ]} />
                  <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            The <Link href="/guides/connect-four-strategy-guide" className="font-semibold underline transition-colors hover:text-bd-coral" style={{ color: 'var(--bd-ink)' }}>Connect Four strategy guide</Link> goes deeper: centre control, the double threat and the mistakes that lose games.
          </p>
        </GuideSection>

        <GuideSection title="Playing on Boardly">
          <div className="space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs AI:</strong> Play solo at any time. Great for practicing before challenging a friend.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs Friend:</strong> Share a lobby link — your friend joins in seconds, no account needed.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Turn timer:</strong> Every turn is on a countdown, and running out forfeits the round. Choose 30, 60, 90, or 120 seconds when you create the lobby.</p>
            <p>All of these are chosen when you create a game from the <Link href="/games/connect-four" className="font-semibold underline transition-colors hover:text-bd-coral" style={{ color: 'var(--bd-ink)' }}>Connect Four game page</Link>.</p>
          </div>
        </GuideSection>

        <GuideSection title="Connect Four Questions">
          <GuideFaqList items={faq} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
