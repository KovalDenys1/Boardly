'use client'

import { useEffect, useState } from 'react'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameScoreboardHeader, { type GameHeaderRoom } from '@/components/game-chrome/GameScoreboardHeader'
import GameStatusBanner, { type GameTurn } from '@/components/game-chrome/GameStatusBanner'
import { Icon } from '@/components/icons'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'

const NAMES = ['Mia', 'Column Tactician', 'Liv', 'Token Tactician 3', 'Emma', 'Oskar', 'Nora', 'Filip']
const ACCENTS = ['var(--bd-coral)', 'var(--bd-mint)', 'var(--bd-sun)', 'var(--bd-sky)', 'var(--bd-lav)', 'var(--bd-coral)', 'var(--bd-mint)', 'var(--bd-sun)']

const SEAT_COLOURS = ['coral', 'sun', 'lav', 'mint', 'sky']
const LEVELS: [string, number][] = [['normal', 42], ['low', 9], ['critical', 4]]

const room = (extra: Partial<GameHeaderRoom> = {}): GameHeaderRoom => ({
  gameId: 'connect-four',
  title: 'Connect Four',
  code: '7492',
  allowSpectators: true,
  onLeave: () => {},
  ...extra,
})

function seat(index: number, active: number, side: 'left' | 'right' = 'left') {
  return (
    <GamePlayerCard
      name={NAMES[index]}
      isActive={index === active}
      isMe={index === 0}
      isWinner={false}
      side={side}
      accentColor={ACCENTS[index]}
      subline={`${index * 3} pts`}
    />
  )
}

/** The longest a username can be. */
const LONG_NAME = 'Maximilian Alexander'

/** Every status line the eleven games can show, as `[whose, key]`. */
const STATUS_LINES: [GameTurn['whose'], TranslationKeys][] = [
  ['you', 'games.tictactoe.game.turnPlace'], ['player', 'games.tictactoe.game.doingPlace'],
  ['you', 'games.connect_four.game.turnDrop'], ['player', 'games.connect_four.game.doingDrop'],
  ['you', 'games.checkers.game.turnMove'], ['you', 'games.checkers.game.turnCapture'],
  ['you', 'games.checkers.game.turnKeepJumping'], ['player', 'games.checkers.game.doingMove'],
  ['you', 'games.ludo.game.turnRoll'], ['you', 'games.ludo.game.turnMoveToken'],
  ['player', 'games.ludo.game.doingRoll'], ['player', 'games.ludo.game.doingMoveToken'],
  ['you', 'games.memory.game.turnFlipTwo'], ['you', 'games.memory.game.turnFlipOne'], ['player', 'games.memory.game.doingFlip'],
  ['you', 'games.rock_paper_scissors.turnPick'], ['player', 'games.rock_paper_scissors.doingPick'],
  ['nobody', 'games.rock_paper_scissors.bothChoosing'], ['nobody', 'games.rock_paper_scissors.revealing'],
  ['you', 'yahtzee.ui.turnRollFirst'], ['you', 'yahtzee.ui.turnHoldOrPick'], ['you', 'yahtzee.ui.turnPickBox'],
  ['player', 'yahtzee.ui.doingRoll'], ['player', 'yahtzee.ui.doingPickBox'],
  ['everyone', 'spy.turnCheckRole'], ['nobody', 'spy.playersCheckingRoles'], ['you', 'spy.turnAsk'], ['player', 'spy.doingAsk'],
  ['you', 'spy.turnAnswer'], ['player', 'spy.doingAnswer'], ['everyone', 'spy.turnVote'], ['nobody', 'spy.playersVoting'],
  ['you', 'alias.turnDescribe'], ['you', 'alias.turnGuess'], ['player', 'alias.doingDescribe'],
  ['you', 'liarsParty.turnClaim'], ['player', 'liarsParty.doingClaim'], ['everyone', 'liarsParty.turnJudge'],
  ['nobody', 'liarsParty.tableVoting'], ['nobody', 'liarsParty.tableVotingOnYourClaim'],
  ['you', 'games.guess_my_drawing.game.turnChoose'], ['you', 'games.guess_my_drawing.game.turnDraw'],
  ['you', 'games.guess_my_drawing.game.turnGuess'], ['player', 'games.guess_my_drawing.game.doingChoose'],
  ['player', 'games.guess_my_drawing.game.doingDraw'],
]

function StatusLines() {
  const { t, i18n } = useTranslation()
  // Set only after hydration, so a test that waits for it measures banners whose refs have run.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const turnOf = ([whose, key]: (typeof STATUS_LINES)[number]): GameTurn => {
    const text = t(key, { value: 6 })
    if (whose === 'player') return { whose, player: LONG_NAME, doing: text }
    if (whose === 'nobody') return { whose, line: text }
    return { whose, action: text }
  }
  // 264px is narrower than any game page gives its banner at 320x568 or 844x390.
  return (
    <div data-testid="status-lines" data-locale={hydrated ? i18n.language : undefined} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 264px)', justifyContent: 'center', gap: 8 }}>
      {STATUS_LINES.flatMap((entry) => {
        const turn = turnOf(entry)
        const props = { isFinished: false, turn, meta: 'Round 1/15', secs: 60, turnTimerLimit: 60, barColor: 'var(--bd-sun)', leadingIcon: <Icon name="mask" size={20} /> }
        return [
          <GameStatusBanner key={`live-${entry[1]}`} {...props} />,
          ...(turn.whose === 'player' || turn.whose === 'nobody' ? [<GameStatusBanner key={`spectator-${entry[1]}`} {...props} isSpectator />] : []),
        ]
      })}
    </div>
  )
}

function Case({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section data-testid={`chrome-${id}`} className="ttt-card" style={{ padding: '12px 16px' }}>
      {children}
    </section>
  )
}

export default function GameChromeSheet() {
  const score = <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1 }}>2 : 1</div>
  const scoreCompact = <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1 }}>2 : 1</div>
  return (
    <div data-testid="chrome-sheet" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, padding: 16, maxWidth: 1272, margin: '0 auto', background: 'var(--bd-bg)' }}>
      <Case id="two">
        <GameScoreboardHeader room={room()} leftCard={seat(0, 0)} center={score} centerCompact={scoreCompact} rightCard={seat(1, 0, 'right')} />
      </Case>
      <Case id="two-turn-passed">
        <GameScoreboardHeader room={room()} leftCard={seat(0, 1)} center={score} centerCompact={scoreCompact} rightCard={seat(1, 1, 'right')} />
      </Case>
      <Case id="two-no-spectators">
        <GameScoreboardHeader room={room({ allowSpectators: false, gameId: 'rps', title: 'Rock Paper Scissors' })} leftCard={seat(0, 0)} center={score} centerCompact={scoreCompact} rightCard={seat(1, 0, 'right')} />
      </Case>
      {[3, 4, 6, 8].map((count) => (
        <Case key={count} id={`players-${count}`}>
          <GameScoreboardHeader room={room({ gameId: 'ludo', title: 'Ludo' })} players={Array.from({ length: count }, (_, index) => seat(index, 1))} />
        </Case>
      ))}
      <Case id="players-4-turn-passed">
        <GameScoreboardHeader room={room({ gameId: 'ludo', title: 'Ludo' })} players={Array.from({ length: 4 }, (_, index) => seat(index, 3))} />
      </Case>
      <Case id="spectator">
        <GameScoreboardHeader room={room({ isSpectator: true, onLeave: undefined })} leftCard={seat(0, 0)} center={score} centerCompact={scoreCompact} rightCard={seat(1, 0, 'right')} />
      </Case>
      {SEAT_COLOURS.map((seat) => (
        <div key={seat} data-testid={`banners-${seat}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          {LEVELS.map(([level, secs]) => (
            <div key={level} data-testid={`banner-${seat}-${level}`}>
              <GameStatusBanner isFinished={false} turn={{ whose: 'nobody', line: `${seat} – ${level}` }} meta="#7" secs={secs} turnTimerLimit={60} barColor={`var(--bd-${seat})`} />
            </div>
          ))}
        </div>
      ))}
      <div data-testid="banner-idle">
        <GameStatusBanner isFinished={false} turn={{ whose: 'you', action: 'roll the dice' }} meta="#7" secs={40} turnTimerLimit={60} barColor="var(--bd-coral)" isYourTurn />
      </div>
      <StatusLines />
    </div>
  )
}
