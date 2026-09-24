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
    expect(container.querySelector('[data-testid="game-status-timer-bar"]')).toBeNull()
  })

  /**
   * The shape Alias actually passes (alias-page.tsx describer and guesser
   * screens): showTimer={false} because the countdown ring below is the game's
   * clock, and turnTimerLimit={60} because there IS a deadline - it is just
   * drawn somewhere else. The first version of this test passed
   * turnTimerLimit={0}, which the pre-existing `turnTimerLimit > 0` term
   * already killed, so it held with the new `showTimer &&` term deleted (#905
   * review). Both halves are asserted here: with the clock shown, the same
   * numbers must still raise the nudge, or the test is proving nothing but
   * that 25 < 15.
   */
  const idleShape = { ...base, isYourTurn: true, secs: 35, turnTimerLimit: 60 }

  it('keeps the idle nudge off a banner whose clock is drawn elsewhere', () => {
    render(<GameStatusBanner {...idleShape} showTimer={false} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })

  it('still raises the idle nudge on the same turn when the banner owns the clock', () => {
    render(<GameStatusBanner {...idleShape} />)
    expect(screen.getByText('game.ui.firstMoveNudge')).toBeTruthy()
  })
})

describe('GameStatusBanner motion (#1111)', () => {
  const base = {
    isFinished: false,
    activeTitle: "Alice's turn",
    secs: 30,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
  }

  it('remounts the title with the cue class when the turn changes', () => {
    const { rerender } = render(<GameStatusBanner {...base} />)
    const first = screen.getByTestId('game-status-title')
    expect(first.className).toContain('game-status-cue')

    rerender(<GameStatusBanner {...base} secs={29} />)
    // A timer tick is not a turn change: same node, no replayed cue.
    expect(screen.getByTestId('game-status-title')).toBe(first)

    rerender(<GameStatusBanner {...base} activeTitle="Your turn" />)
    const second = screen.getByTestId('game-status-title')
    expect(second).not.toBe(first)
    expect(second.className).toContain('game-status-cue')
    expect(second.textContent).toContain('Your turn')
  })

  it('cues the spectator line and the finished plate too', () => {
    const { rerender } = render(<GameStatusBanner {...base} isSpectator />)
    const spectating = screen.getByTestId('game-status-title')
    rerender(<GameStatusBanner {...base} isSpectator activeTitle="Bob's turn" />)
    expect(screen.getByTestId('game-status-title')).not.toBe(spectating)

    rerender(<GameStatusBanner {...base} isFinished finishedMessage="Alice wins!" />)
    expect(screen.getByTestId('game-status-title').className).toContain('game-status-cue')
  })

  it('drives the timer bar with scaleX from the left, never width', () => {
    const { rerender } = render(<GameStatusBanner {...base} />)
    const bar = screen.getByTestId('game-status-timer-bar')
    expect(bar.style.transform).toBe('scaleX(0.5)')
    expect(bar.style.transformOrigin).toBe('left center')
    expect(bar.style.width).toBe('100%')
    expect(bar.style.transition).not.toContain('width')

    rerender(<GameStatusBanner {...base} secs={90} />)
    expect(screen.getByTestId('game-status-timer-bar').style.transform).toBe('scaleX(1)')
  })
})
