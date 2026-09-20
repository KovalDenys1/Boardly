import { render, screen } from '@testing-library/react'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('GameStatusBanner (#736 phase 4)', () => {
  const base = {
    isFinished: false,
    activeTitle: "Alice's turn",
    secs: 45,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
  }

  it('renders the active-turn banner with timer and meta', () => {
    render(<GameStatusBanner {...base} meta="#5" />)
    expect(screen.getByText("Alice's turn")).toBeTruthy()
    expect(screen.getByText('#5')).toBeTruthy()
    expect(screen.getByText(':45')).toBeTruthy()
  })

  it('renders the victory plate when finished', () => {
    render(<GameStatusBanner {...base} isFinished finishedMessage="Alice wins!" />)
    expect(screen.getByText('game.ui.victoryBadge')).toBeTruthy()
    expect(screen.getByText('Alice wins!')).toBeTruthy()
    expect(screen.queryByText(':45')).toBeNull()
  })

  it('renders the draw plate when finished with a draw', () => {
    render(<GameStatusBanner {...base} isFinished isDraw finishedMessage="It's a tie" />)
    expect(screen.getByText('game.ui.drawBadge')).toBeTruthy()
    expect(screen.getByText("It's a tie")).toBeTruthy()
  })

  it('renders the spectator variant without a timer', () => {
    render(<GameStatusBanner {...base} isSpectator />)
    expect(screen.getByText('game.ui.spectatingBadge')).toBeTruthy()
    expect(document.querySelector('[data-icon="eye"]')).toBeTruthy()
    expect(screen.queryByText(':45')).toBeNull()
  })
})

describe('GameStatusBanner idle nudge (#817)', () => {
  const base = {
    isFinished: false,
    activeTitle: 'Your turn',
    secs: 60,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
  }

  it('stays quiet while the acting player still has most of their turn', () => {
    render(<GameStatusBanner {...base} isYourTurn secs={50} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })

  it('speaks up once the acting player has sat on their turn', () => {
    // A third of abandoned games never record a single move, and the roster
    // shows both players were present when the clock started — the turn timer
    // used to run out in silence.
    render(<GameStatusBanner {...base} isYourTurn secs={45} />)
    expect(screen.getByText('game.ui.firstMoveNudge')).toBeTruthy()
  })

  it('never nudges a player who is not the one to move', () => {
    render(<GameStatusBanner {...base} isYourTurn={false} secs={10} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })

  it('does not nudge when no turn timer is configured', () => {
    // Without a limit there is no elapsed time to measure against.
    render(<GameStatusBanner {...base} isYourTurn secs={0} turnTimerLimit={0} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })
})

describe('GameStatusBanner clock and untimed phases (#905)', () => {
  const base = {
    isFinished: false,
    activeTitle: 'Question round',
    secs: 45,
    turnTimerLimit: 60,
    barColor: 'var(--bd-lav)',
  }

  it('prints minutes once the clock passes 99 seconds', () => {
    // Guess the Spy's question round is 300s; every earlier adopter ran 30-120s.
    render(<GameStatusBanner {...base} secs={291} turnTimerLimit={300} />)
    expect(screen.getByText('4:51')).toBeTruthy()
    expect(screen.queryByText(':291')).toBeNull()
  })

  it('still prints a two-digit turn timer under 100 seconds', () => {
    render(<GameStatusBanner {...base} secs={7} />)
    expect(screen.getByText(':07')).toBeTruthy()
  })

  it('shows neither clock nor bar on a phase with no deadline', () => {
    const { container } = render(
      <GameStatusBanner {...base} showTimer={false} secs={0} turnTimerLimit={0} activeTitle="0/3 players ready" />
    )
    expect(screen.getByText('0/3 players ready')).toBeTruthy()
    expect(screen.queryByText(':00')).toBeNull()
    // The bar is the only element carrying a width percentage.
    expect(container.querySelector('[style*="width: 100%"]')).toBeNull()
  })

  it('keeps the idle nudge off an untimed phase', () => {
    render(<GameStatusBanner {...base} showTimer={false} isYourTurn secs={0} turnTimerLimit={0} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })
})
