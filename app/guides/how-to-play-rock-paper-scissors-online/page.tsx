import type { Metadata } from 'next'
import { buildGuideMetadata, buildGuideArticleJsonLd, buildGuideBreadcrumbJsonLd } from '@/lib/guide-seo'
import Link from 'next/link'
import GuideLayout, { GuideSection, GuideTipList, GuideChecklist, GuideSteps, GuideFaqList, buildGuideFaqJsonLd, type GuideFaqItem } from '../components/GuideLayout'

export const metadata: Metadata = buildGuideMetadata('how-to-play-rock-paper-scissors-online')

const articleJsonLd = buildGuideArticleJsonLd('how-to-play-rock-paper-scissors-online')

const breadcrumbJsonLd = buildGuideBreadcrumbJsonLd('how-to-play-rock-paper-scissors-online')

/**
 * Rendered by `GuideFaqList` below and fed to the FAQPage schema from the same
 * array (#964), so the markup can never describe a question the page does not
 * show.
 */
const faq: GuideFaqItem[] = [
  {
    question: 'How many rounds is a match?',
    answer: 'A match is best of three: the first player to win two rounds takes it. A drawn round scores nothing for either side and is simply replayed, so a match can run to four or five rounds and still be decided by the first player to reach two.',
  },
  {
    question: 'What happens if we both pick the same thing?',
    answer: 'The round is a draw. Neither score moves, nothing is carried over, and the same round is played again with both choices cleared. Draws are common – with two players picking at random, one round in three ends this way.',
  },
  {
    question: 'Is there a time limit on a round?',
    answer: 'Yes, 60 seconds to lock in a choice. Running out does not forfeit the round: the game picks one of the three for you at random and the round is scored as normal. It still costs you, because a random choice is the one thing an opponent reading you cannot get wrong.',
  },
  {
    question: 'Can I play Rock Paper Scissors against the computer?',
    answer: 'Yes, on three levels. The easy bot picks at random every round and cannot be read. The medium and hard bots count what you have played and answer the move you play most often – hard does it every round, medium only about seven rounds in ten, picking at random the rest of the time.',
  },
  {
    question: 'Is Rock Paper Scissors a game of skill or luck?',
    answer: 'Against someone picking at random it is pure luck, and no strategy beats a coin toss with three sides. Against a person it is skill, because people do not pick at random – they repeat a move that won, they drop a move that lost, and every one of those habits is something you can answer.',
  },
  {
    question: 'Can other people watch a match?',
    answer: 'Only if the host turns spectators on when creating the lobby – the setting is off by default. Spectators get the board and the chat read-only, and they cannot pick a move or affect the match in any way.',
  },
  {
    question: 'Do I need an account to play?',
    answer: 'No. You can create a lobby or join one from a shared link as a guest, on desktop or on a phone, with nothing to download and nothing to install.',
  },
]

const faqJsonLd = buildGuideFaqJsonLd(faq)

export default function HowToPlayRockPaperScissorsGuide() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <GuideLayout
        icon={{ game: 'rps' }}
        slug="how-to-play-rock-paper-scissors-online"
        title="How to Play Rock Paper Scissors Online"
        subtitle="6 min read · Free to play on Boardly · 2 players or vs AI"
        question="How do you play Rock Paper Scissors online?"
        answer="Both players pick Rock, Paper or Scissors at the same time, the two choices are revealed together, and the first player to win two rounds takes the match – Rock beats Scissors, Scissors beats Paper, and Paper beats Rock."
        accentColor="var(--bd-lav)"
        cta={{ href: '/games/rock-paper-scissors/lobbies', label: 'Play Rock Paper Scissors Now', detail: 'Ready to throw your first move?' }}
        related={[
          { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
          { href: '/guides/how-to-play-connect-four-online', label: 'How to Play Connect Four Online' },
          { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
          { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online – Free, No Download' },
          { href: '/guides/best-games-to-play-on-zoom', label: 'Best Games to Play on Zoom – Free, No Download' },
        ]}
      >
        <GuideSection title="What You Need">
          <GuideChecklist items={[
            { mark: 'yes', text: '2 players – or play solo against AI' },
            { mark: 'yes', text: 'A browser – desktop, tablet, or mobile' },
            { mark: 'yes', text: 'No account required (guest play available)' },
            { mark: 'yes', text: 'Free – no download, nothing to install' },
          ]} />
        </GuideSection>

        <GuideSection title="The Rules">
          <GuideSteps steps={[
            {
              title: 'Two players, one lobby',
              detail: 'A Rock Paper Scissors room seats exactly two. Create a lobby and send the code to a friend, or fill the second seat with a bot and play on your own.',
            },
            {
              title: 'Both pick at the same time',
              detail: 'There are no turns in this game. You choose Rock, Paper or Scissors whenever you are ready, and so does your opponent. Locking in first gives nothing away: your choice stays hidden until theirs is in too.',
            },
            {
              title: 'The reveal decides the round',
              detail: 'Both choices appear together. Rock beats Scissors, Scissors beats Paper, Paper beats Rock, and the winner of the round takes a point.',
            },
            {
              title: 'Same choice, no score',
              detail: 'If you both pick the same thing the round is a draw. Neither score moves, nothing carries over, and the round is played again from scratch.',
            },
            {
              title: 'First to two wins the match',
              detail: 'A match is best of three, so two round wins ends it. Because draws are replayed rather than scored, a close match often runs past three rounds before anyone gets there.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="What Beats What">
          <p className="mb-4 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            Three moves, and every one of them beats exactly one of the other two and loses to the other:
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              'Rock blunts Scissors',
              'Scissors cut Paper',
              'Paper covers Rock',
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

        <GuideSection title="Strategy Against a Person">
          <GuideTipList items={[
            {
              tip: 'Random is the only move nobody can beat',
              detail: 'Pick each of the three at random and no opponent alive can do better than break even against you over time. That is the floor, and it is worth knowing before anything else: every idea below is about beating a player who is not doing that, which is almost everybody.',
            },
            {
              tip: 'Watch what they do after losing a round',
              detail: 'Losing a round makes most people abandon the move that just lost. If their Rock was cut down by your Paper, Rock is the least likely thing they play next, so the move that beats Rock is the one you can afford to drop.',
            },
            {
              tip: 'Watch what they do after winning one',
              detail: 'The opposite habit is just as common. A move that has just won feels lucky, and plenty of players throw it again. If their Paper covered your Rock, expect Paper a second time and answer it with Scissors.',
            },
            {
              tip: 'Break your own pattern before they read it',
              detail: 'All of this works on you too. If you notice you have opened with the same move twice, change it – not because the move is bad, but because two is enough for an attentive opponent to start guessing.',
            },
            {
              tip: 'A best-of-three rewards a single good read',
              detail: 'You do not need an edge that pays off over fifty rounds. Two correct reads win the match outright, which is why paying attention in the first round matters far more here than in a longer game.',
            },
            {
              tip: 'Do not let the clock pick for you',
              detail: 'Let the 60 seconds run out and a random move is submitted on your behalf. That is not a disaster, but it throws away the round you might have won on a read, and it gives your opponent one clean round of data on you for nothing.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="How the Bot Actually Plays">
          <div className="mb-5 space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            <p>
              The bot is worth understanding, because two of its three levels follow a rule you can work out and
              then use against it. None of them can see your choice before you commit it – they are guessing from
              your history, exactly as you would.
            </p>
          </div>
          <GuideTipList items={[
            {
              tip: 'Easy – a pure coin toss',
              detail: 'The easy bot picks one of the three at random every round and never looks at what you have played. There is no pattern in it, so there is nothing to exploit: you will win about a third, lose about a third and draw about a third, whatever you try.',
            },
            {
              tip: 'Medium – reads you, but not every round',
              detail: 'The medium bot works out which move you play most and answers it, but only about seven times in ten. The other three it picks at random. That is enough noise to make it feel unpredictable while still punishing an obvious habit.',
            },
            {
              tip: 'Hard – reads you every single round',
              detail: 'The hard bot always plays the counter to whatever you have played most often, and it counts your most recent round twice, so it swings quickly toward whatever you just did. It never mixes in a random move.',
            },
            {
              tip: 'Which is exactly what makes the hard bot beatable',
              detail: 'A rule with no randomness in it can be answered. Work out which move you have played most, then play the move that loses to it. If you have been throwing Rock, the bot expects Rock and plays Paper, so Scissors takes the round. Keep going and your Scissors count climbs until Scissors is your most-played move, at which point the bot starts expecting that instead and the answer becomes Paper. You stay one step ahead of a prediction built from rounds that have already happened.',
            },
            {
              tip: 'Every bot opens blind',
              detail: 'On the first round of a match there is no history to read, so all three levels pick at random. Nothing you do in round one gives anything away, and nothing the bot does there tells you anything either.',
            },
          ]} />
        </GuideSection>

        <GuideSection title="Playing on Boardly">
          <div className="space-y-3 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs AI:</strong> Fill the second seat with a bot on easy, medium or hard and start immediately, with no waiting for an opponent.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>vs Friend:</strong> Share the lobby link and your friend is in within seconds. Neither of you needs an account.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Hidden until the reveal:</strong> Lock in as early as you like. Your choice is kept from your opponent until theirs is in, so there is no advantage in waiting them out.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Round timer:</strong> Each round gives you 60 seconds. If it expires, a random choice is submitted for you and the round is scored as normal.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Chat:</strong> The chat panel appears when there are two humans in the room. A match against a bot skips it and gives the space to the round history instead.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Spectators:</strong> Off unless the host switches them on when creating the lobby. When they are on, watchers see the board and the chat but cannot take part.</p>
            <p><strong style={{ color: 'var(--bd-ink)' }}>Rematch:</strong> When a match ends the host can start another one straight away, keeping both players in the same room.</p>
            <p>
              Everything on this page describes the version you can play right now on the{' '}
              <Link href="/games/rock-paper-scissors" className="underline transition-colors hover:text-bd-coral" style={{ color: 'var(--bd-ink)' }}>
                Rock Paper Scissors game page
              </Link>.
            </p>
          </div>
        </GuideSection>

        <GuideSection title="Rock Paper Scissors Questions">
          <GuideFaqList items={faq} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
