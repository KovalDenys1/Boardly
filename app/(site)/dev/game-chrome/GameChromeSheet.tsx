'use client'

import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameScoreboardHeader, { type GameHeaderRoom } from '@/components/game-chrome/GameScoreboardHeader'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'

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
              <GameStatusBanner isFinished={false} activeTitle={`${seat} – ${level}`} meta="#7" secs={secs} turnTimerLimit={60} barColor={`var(--bd-${seat})`} />
            </div>
          ))}
        </div>
      ))}
      <div data-testid="banner-idle">
        <GameStatusBanner isFinished={false} activeTitle="Your turn" meta="#7" secs={40} turnTimerLimit={60} barColor="var(--bd-coral)" isYourTurn />
      </div>
    </div>
  )
}
