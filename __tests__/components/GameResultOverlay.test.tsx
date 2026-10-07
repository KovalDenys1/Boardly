import { render, screen, fireEvent, act } from '@testing-library/react'
import GameResultOverlay, {
  RESULT_REVEAL_DELAY_MS,
  resetResultOverlayRevealState,
} from '@/components/game-chrome/GameResultOverlay'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// The after-game block has its own suite (AfterGameActions.test.tsx); here only the
// handover matters — that the overlay renders it and passes the five props through.
const mockAfterGameProps = jest.fn()
jest.mock('@/components/game-chrome/AfterGameActions', () => {
  return function MockAfterGameActions(props: Record<string, unknown>) {
    mockAfterGameProps(props)
    return <div data-testid="after-game-actions" />
  }
})

describe('GameResultOverlay (#736 phase 2)', () => {
  const base = {
    title: 'Alice wins!',
    onInspect: jest.fn(),
    isHost: true,
    onPlayAgain: jest.fn(),
    onReturnToLobby: jest.fn(),
    onLeave: jest.fn(),
    gameType: 'tic_tac_toe' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders title, default kicker, and all host actions', () => {
    render(<GameResultOverlay {...base} />)
    expect(screen.getByText('Alice wins!')).toBeTruthy()
    expect(screen.getByText('game.ui.roundOver')).toBeTruthy()
    expect(screen.getByText('game.ui.viewBoard')).toBeTruthy()
    expect(screen.getByText('lobby.game.playAgain')).toBeTruthy()
    expect(screen.getByText('game.ui.returnToLobby')).toBeTruthy()
    expect(screen.getByText('game.ui.leave')).toBeTruthy()
    expect(screen.queryByText('game.ui.waitingForHost')).toBeNull()
  })

  it('hands the after-game block everything it needs (#982)', () => {
    render(
      <GameResultOverlay
        {...base}
        inviteCode="AB12"
        isGuest
        registerUrl="/auth/register"
        isRegistered={false}
      />
    )
    expect(screen.getByTestId('after-game-actions')).toBeTruthy()
    expect(mockAfterGameProps).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'overlay',
        inviteCode: 'AB12',
        gameType: 'tic_tac_toe',
        isGuest: true,
        isRegistered: false,
        registerUrl: '/auth/register',
      })
    )
  })

  it('shows the waiting plate instead of actions for non-hosts', () => {
    render(<GameResultOverlay {...base} isHost={false} />)
    expect(screen.getByText('game.ui.waitingForHost')).toBeTruthy()
    expect(screen.queryByText('lobby.game.playAgain')).toBeNull()
    expect(screen.queryByText('game.ui.returnToLobby')).toBeNull()
    // Leave stays available to everyone
    expect(screen.getByText('game.ui.leave')).toBeTruthy()
    // …and so does the next step; a non-host can still pull a friend in (#927).
    expect(screen.getByTestId('after-game-actions')).toBeTruthy()
  })

  it('disables Play Again while loading (double-submit guard)', () => {
    const onPlayAgain = jest.fn()
    render(<GameResultOverlay {...base} onPlayAgain={onPlayAgain} isLoading />)
    const btn = screen.getByText('…').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onPlayAgain).not.toHaveBeenCalled()
  })

  it('supports a custom kicker and actionsReplacement, keeping the after-game block under it', () => {
    render(
      <GameResultOverlay
        {...base}
        kicker="Series complete"
        actionsReplacement={<div>returning…</div>}
      />
    )
    expect(screen.getByText('Series complete')).toBeTruthy()
    expect(screen.getByText('returning…')).toBeTruthy()
    expect(screen.queryByText('lobby.game.playAgain')).toBeNull()
    // `actionsReplacement` replaces the host/non-host ternary only, so TTT's
    // "Returning to lobby…" plate still gets share and the Discord line beneath it.
    expect(screen.getByTestId('after-game-actions')).toBeTruthy()
  })

  it('puts Play again first and View board, Return to lobby and Leave in one row under it (#1341)', () => {
    render(<GameResultOverlay {...base} />)
    const row = screen.getByTestId('game-result-secondary')
    expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'game.ui.viewBoard',
      'game.ui.returnToLobby',
      'game.ui.leave',
    ])
    const primary = screen.getByText('lobby.game.playAgain')
    expect(primary.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The after-game block comes after both, below the fold on a short board.
    expect(row.compareDocumentPosition(screen.getByTestId('after-game-actions')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('fades the scroller only while content sits below the fold (#1341)', () => {
    const heights = { scrollHeight: 709, clientHeight: 274 }
    const spies = (['scrollHeight', 'clientHeight'] as const).map((prop) =>
      jest.spyOn(HTMLElement.prototype, prop, 'get').mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === 'game-result-overlay-scroll' ? heights[prop] : 0
      })
    )
    try {
      render(<GameResultOverlay {...base} />)
      const scroller = screen.getByTestId('game-result-overlay-scroll')
      expect(scroller.getAttribute('data-more-below')).toBe('true')
      scroller.scrollTop = 435
      fireEvent.scroll(scroller)
      expect(scroller.getAttribute('data-more-below')).toBe('false')
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })

  it('renders the draw handshake instead of the trophy', () => {
    render(<GameResultOverlay {...base} title="It's a draw" isDraw />)
    expect(document.querySelector('[data-icon="handshake"]')).toBeTruthy()
    expect(screen.queryByText('🏆')).toBeNull()
  })
})

describe('GameResultOverlay reveal (#1111)', () => {
  const base = {
    title: 'Alice wins!',
    onInspect: jest.fn(),
    isHost: true,
    onPlayAgain: jest.fn(),
    gameType: 'tic_tac_toe' as const,
  }
  const originalMatchMedia = window.matchMedia

  function mockReducedMotion(reduce: boolean) {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    })
  }

  const overlay = () => screen.getByTestId('game-result-overlay')

  beforeEach(() => {
    jest.useFakeTimers()
    resetResultOverlayRevealState()
    mockReducedMotion(false)
  })

  afterEach(() => {
    jest.useRealTimers()
    ;(window as unknown as { matchMedia: unknown }).matchMedia = originalMatchMedia
  })

  it('waits the default delay, invisible and click-through, then shows', () => {
    render(<GameResultOverlay {...base} />)
    expect(overlay().getAttribute('data-state')).toBe('pending')
    expect(overlay().style.opacity).toBe('0')
    expect(overlay().style.pointerEvents).toBe('none')
    // Still mounted with its content, so adopters that query it keep working.
    expect(screen.getByText('Alice wins!')).toBeTruthy()

    act(() => { jest.advanceTimersByTime(RESULT_REVEAL_DELAY_MS - 1) })
    expect(overlay().getAttribute('data-state')).toBe('pending')

    act(() => { jest.advanceTimersByTime(1) })
    expect(overlay().getAttribute('data-state')).toBe('shown')
    expect(overlay().style.opacity).toBe('')
    expect(overlay().style.pointerEvents).toBe('')
  })

  it('honours a custom revealDelayMs, and 0 shows at once', () => {
    const { unmount } = render(<GameResultOverlay {...base} revealDelayMs={200} />)
    act(() => { jest.advanceTimersByTime(199) })
    expect(overlay().getAttribute('data-state')).toBe('pending')
    act(() => { jest.advanceTimersByTime(1) })
    expect(overlay().getAttribute('data-state')).toBe('shown')
    unmount()

    render(<GameResultOverlay {...base} revealDelayMs={0} />)
    expect(overlay().getAttribute('data-state')).toBe('shown')
  })

  it('does not wait under prefers-reduced-motion', () => {
    mockReducedMotion(true)
    render(<GameResultOverlay {...base} />)
    expect(overlay().getAttribute('data-state')).toBe('shown')
    expect(overlay().style.opacity).toBe('')
  })

  it('does not wait again when the player comes back from View board to the same finish', () => {
    const { unmount } = render(<GameResultOverlay {...base} resultKey="g1:100" />)
    act(() => { jest.advanceTimersByTime(RESULT_REVEAL_DELAY_MS) })
    fireEvent.click(screen.getByText('game.ui.viewBoard'))
    expect(base.onInspect).toHaveBeenCalled()
    unmount()

    const back = render(<GameResultOverlay {...base} resultKey="g1:100" />)
    expect(overlay().getAttribute('data-state')).toBe('shown')
    back.unmount()
  })

  // #1111 review: several pages reset their inspect state on a rematch without
  // remounting the overlay, so the note outlived its game and the next game's
  // overlay appeared instantly over the finishing move.
  it('waits again after View board and a rematch (new game id), with no mount in between', () => {
    const { unmount } = render(<GameResultOverlay {...base} resultKey="g1:100" />)
    fireEvent.click(screen.getByText('game.ui.viewBoard'))
    unmount()

    render(<GameResultOverlay {...base} resultKey="g2:250" />)
    expect(overlay().getAttribute('data-state')).toBe('pending')
  })

  it('waits again for the next round of the same game (same id, new finish)', () => {
    const { unmount } = render(<GameResultOverlay {...base} resultKey="g1:100" />)
    fireEvent.click(screen.getByText('game.ui.viewBoard'))
    unmount()

    render(<GameResultOverlay {...base} resultKey="g1:180" />)
    expect(overlay().getAttribute('data-state')).toBe('pending')
  })

  it('drops the note once another finish mounts, so an old key cannot come back', () => {
    const first = render(<GameResultOverlay {...base} resultKey="g1:100" />)
    fireEvent.click(screen.getByText('game.ui.viewBoard'))
    first.unmount()
    const other = render(<GameResultOverlay {...base} resultKey="g2:250" />)
    other.unmount()

    render(<GameResultOverlay {...base} resultKey="g1:100" />)
    expect(overlay().getAttribute('data-state')).toBe('pending')
  })

  it('always waits when the adopter passes no resultKey', () => {
    const { unmount } = render(<GameResultOverlay {...base} />)
    fireEvent.click(screen.getByText('game.ui.viewBoard'))
    unmount()

    render(<GameResultOverlay {...base} />)
    expect(overlay().getAttribute('data-state')).toBe('pending')
  })

  it('clears its timer on unmount', () => {
    const { unmount } = render(<GameResultOverlay {...base} />)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })
})
