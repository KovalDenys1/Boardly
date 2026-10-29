import { render, screen, fireEvent, act } from '@testing-library/react'
import GameResultOverlay, {
  RESULT_REVEAL_DELAY_MS,
  resetResultOverlayRevealState,
} from '@/components/game-chrome/GameResultOverlay'
import { playCue } from '@/lib/sound-engine'
import { noteLiveFinish, resetLiveFinish } from '@/lib/live-finish'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

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

const mockRematch = { requestedBy: null as string | null, askState: 'idle' as 'idle' | 'sending' | 'sent', ask: jest.fn() }
const mockRematchCode = jest.fn()
jest.mock('@/hooks/useRematchSignal', () => ({
  useRematchSignal: (code: string | null) => {
    mockRematchCode(code)
    return mockRematch
  },
}))

describe('GameResultOverlay (#736 phase 2)', () => {
  const base = {
    title: 'Alice wins!',
    onInspect: jest.fn(),
    isHost: true,
    onPlayAgain: jest.fn(),
    onReturnToLobby: jest.fn(),
    onLeave: jest.fn(),
    gameType: 'tic_tac_toe' as const,
    revealDelayMs: 0,
  }

  const openMore = () => fireEvent.click(screen.getByText('game.ui.resultMore'))

  beforeEach(() => {
    jest.clearAllMocks()
    resetResultOverlayRevealState()
    mockRematch.requestedBy = null
    mockRematch.askState = 'idle'
  })

  it('renders the title and Play again, with Return to lobby and Leave behind More (#1564)', () => {
    render(<GameResultOverlay {...base} />)
    expect(screen.getByText('Alice wins!')).toBeTruthy()
    expect(screen.getByText('game.ui.viewBoard')).toBeTruthy()
    expect(screen.getByText('lobby.game.playAgain')).toBeTruthy()
    expect(screen.queryByText('game.ui.returnToLobby')).toBeNull()
    expect(screen.queryByText('game.ui.waitingForHost')).toBeNull()
    openMore()
    expect(screen.getByText('game.ui.returnToLobby')).toBeTruthy()
    expect(screen.getByText('game.ui.leave')).toBeTruthy()
  })

  it('hands the after-game block everything it needs, inside More (#982)', () => {
    render(
      <GameResultOverlay
        {...base}
        inviteCode="AB12"
        isGuest
        isRegistered={false}
      />
    )
    expect(screen.queryByTestId('after-game-actions')).toBeNull()
    openMore()
    expect(screen.getByTestId('after-game-actions')).toBeTruthy()
    expect(mockAfterGameProps).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'menu',
        inviteCode: 'AB12',
        gameType: 'tic_tac_toe',
        isGuest: true,
        isRegistered: false,
      })
    )
  })

  describe('rematch ask', () => {
    it('lets a seated non-host ask the host for a rematch instead of only waiting', () => {
      render(<GameResultOverlay {...base} isHost={false} isGuest inviteCode="AB12" />)
      fireEvent.click(screen.getByText('game.ui.askRematch'))
      expect(mockRematch.ask).toHaveBeenCalled()
      expect(mockRematchCode).toHaveBeenCalledWith('AB12')
    })

    it('says the ask went out once it did', () => {
      mockRematch.askState = 'sent'
      render(<GameResultOverlay {...base} isHost={false} isRegistered inviteCode="AB12" />)
      expect(screen.getByText('game.ui.rematchAsked')).toBeTruthy()
      expect(screen.queryByText('game.ui.askRematch')).toBeNull()
    })

    it('never offers a spectator the ask, nor listens for one, even a signed-in one', () => {
      render(<GameResultOverlay {...base} isHost={false} isRegistered isSpectator inviteCode="AB12" />)
      expect(screen.queryByText('game.ui.askRematch')).toBeNull()
      expect(screen.getByText('game.ui.waitingForHost')).toBeTruthy()
      expect(mockRematchCode).toHaveBeenCalledWith(null)
    })

    it('leaves the ask to an end screen that has its own', () => {
      render(<GameResultOverlay {...base} isHost={false} isGuest canAskRematch={false} inviteCode="AB12" />)
      expect(screen.queryByText('game.ui.askRematch')).toBeNull()
    })

    it('shows the host who asked even when the actions are replaced', () => {
      mockRematch.requestedBy = 'Ada'
      render(<GameResultOverlay {...base} isGuest inviteCode="AB12" actionsReplacement={<button>Series over</button>} />)
      expect(screen.getByRole('status').textContent).toBe('game.ui.rematchWanted')
    })

    it('shows the host who asked, above Play again', () => {
      mockRematch.requestedBy = 'Ada'
      render(<GameResultOverlay {...base} isGuest inviteCode="AB12" />)
      expect(screen.getByRole('status').textContent).toBe('game.ui.rematchWanted')
      expect(screen.getByText('lobby.game.playAgain')).toBeTruthy()
    })
  })

  it('shows the waiting plate instead of actions for non-hosts', () => {
    render(<GameResultOverlay {...base} isHost={false} />)
    expect(screen.getByText('game.ui.waitingForHost')).toBeTruthy()
    expect(screen.queryByText('lobby.game.playAgain')).toBeNull()
    openMore()
    expect(screen.queryByText('game.ui.returnToLobby')).toBeNull()
    // Leave stays available to everyone
    expect(screen.getByText('game.ui.leave')).toBeTruthy()
    // …and so does the next step; a non-host can still pull a friend in (#927).
    expect(screen.getByTestId('after-game-actions')).toBeTruthy()
  })

  it('disables Play Again while loading (double-submit guard)', () => {
    const onPlayAgain = jest.fn()
    render(<GameResultOverlay {...base} onPlayAgain={onPlayAgain} isLoading />)
    const btn = screen.getByText('lobby.game.playAgain').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
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
    // "Returning to lobby…" plate still gets share and the Discord line behind More.
    openMore()
    expect(screen.getByTestId('after-game-actions')).toBeTruthy()
  })

  it('draws a string replacement as the status plate', () => {
    render(<GameResultOverlay {...base} actionsReplacement="Returning to lobby…" />)
    expect(screen.getByRole('status').textContent).toBe('Returning to lobby…')
  })

  it('makes every button at least 44px tall (#1345)', () => {
    render(<GameResultOverlay {...base} inviteCode="AB12" isGuest />)
    const heightPx = (button: HTMLElement) => {
      const rem = button.className.match(/\b(?:min-)?h-\[(\d+(?:\.\d+)?)rem\]/)
      if (rem) return Number(rem[1]) * 16
      const step = button.className.match(/\b(?:min-)?h-(\d+)\b/)
      return step ? Number(step[1]) * 4 : 0
    }
    const check = () => screen.getAllByRole('button').forEach((button) => {
      expect(heightPx(button)).toBeGreaterThanOrEqual(44)
    })
    check()
    openMore()
    check()
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

describe('GameResultOverlay sound (#1464)', () => {
  const base = {
    title: 'Alice wins!',
    onInspect: jest.fn(),
    isHost: true,
    onPlayAgain: jest.fn(),
    gameType: 'tic_tac_toe' as const,
  }
  const play = playCue as jest.Mock
  const resultCalls = () => play.mock.calls.filter(([cue]) => String(cue).startsWith('result.'))
  const wait = (ms: number) => act(() => { jest.advanceTimersByTime(ms) })
  const reveal = () => { wait(RESULT_REVEAL_DELAY_MS); wait(1) }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    resetResultOverlayRevealState()
    resetLiveFinish()
    noteLiveFinish()
    mockRematch.requestedBy = null
    mockRematch.askState = 'idle'
  })

  afterEach(() => jest.useRealTimers())

  it('plays the viewer’s result at the reveal, not at mount, keyed on the finish', () => {
    render(<GameResultOverlay {...base} outcome="win" resultKey="g1:100" gameId="g1" />)
    wait(1)
    expect(resultCalls()).toEqual([])
    reveal()
    expect(resultCalls()).toEqual([['result.win', { gameId: 'g1#1' }]])
  })

  it.each([
    ['loss', false, 'result.loss'],
    ['draw', false, 'result.draw'],
    [undefined, false, 'result.over'],
    ['win', true, 'result.over'],
  ] as const)('outcome %s (spectator %s) plays %s', (outcome, isSpectator, cue) => {
    render(<GameResultOverlay {...base} outcome={outcome} isSpectator={isSpectator} resultKey="g1:100" revealDelayMs={0} />)
    wait(1)
    expect(resultCalls()).toEqual([[cue, { gameId: 'g1#1' }]])
  })

  it('stays silent for a finish the page did not see happen: opened on a finished game, a late spectator, a return', () => {
    resetLiveFinish()
    render(<GameResultOverlay {...base} outcome="win" resultKey="g1:100" revealDelayMs={0} />)
    wait(RESULT_REVEAL_DELAY_MS)
    expect(resultCalls()).toEqual([])
  })

  it('plays once per finish: not again on the way back from View board, again for the next one', () => {
    const first = render(<GameResultOverlay {...base} outcome="loss" resultKey="g1:100" />)
    reveal()
    fireEvent.click(screen.getByText('game.ui.viewBoard'))
    first.unmount()

    const back = render(<GameResultOverlay {...base} outcome="loss" resultKey="g1:100" />)
    reveal()
    expect(resultCalls()).toHaveLength(1)
    back.unmount()

    noteLiveFinish()
    render(<GameResultOverlay {...base} outcome="win" resultKey="g2:250" />)
    reveal()
    expect(resultCalls()).toEqual([
      ['result.loss', { gameId: 'g1#1' }],
      ['result.win', { gameId: 'g2#2' }],
    ])
  })

  it('plays once when the server answer changes the result key under the overlay, then View board and back', () => {
    const local = render(<GameResultOverlay {...base} outcome="win" resultKey="g1:100" />)
    reveal()
    fireEvent.click(screen.getByText('game.ui.viewBoard'))
    local.unmount()

    render(<GameResultOverlay {...base} outcome="win" resultKey="g1:105" />)
    reveal()
    expect(resultCalls()).toEqual([['result.win', { gameId: 'g1#1' }]])
  })

  it('plays again for the next round of a series, which keeps the game id', () => {
    const first = render(<GameResultOverlay {...base} outcome="win" resultKey="g1:100" revealDelayMs={0} />)
    wait(1)
    first.unmount()
    noteLiveFinish()
    render(<GameResultOverlay {...base} outcome="loss" resultKey="g1:180" revealDelayMs={0} />)
    wait(1)
    expect(resultCalls()).toEqual([
      ['result.win', { gameId: 'g1#1' }],
      ['result.loss', { gameId: 'g1#2' }],
    ])
  })

  it('does not try again on a remount when the engine dropped the first attempt', () => {
    play.mockReturnValueOnce(false)
    const first = render(<GameResultOverlay {...base} outcome="win" resultKey="g1:100" revealDelayMs={0} />)
    wait(1)
    first.unmount()
    render(<GameResultOverlay {...base} outcome="win" resultKey="g1:100" revealDelayMs={0} />)
    wait(1)
    expect(resultCalls()).toHaveLength(1)
  })

  it('keys on the game id when the adopter passes no resultKey', () => {
    render(<GameResultOverlay {...base} outcome="draw" gameId="g7" revealDelayMs={0} />)
    wait(1)
    expect(resultCalls()).toEqual([['result.draw', { gameId: 'g7#1' }]])
  })

  it('asks the host with social.ask when a rematch request arrives, not for one already shown at mount', () => {
    const { rerender } = render(<GameResultOverlay {...base} />)
    expect(play).not.toHaveBeenCalledWith('social.ask')
    mockRematch.requestedBy = 'Bob'
    rerender(<GameResultOverlay {...base} />)
    expect(play.mock.calls.filter(([cue]) => cue === 'social.ask')).toHaveLength(1)

    jest.clearAllMocks()
    render(<GameResultOverlay {...base} />)
    expect(play).not.toHaveBeenCalledWith('social.ask')
  })

  it('confirms Play again with ui.confirm', () => {
    render(<GameResultOverlay {...base} revealDelayMs={0} />)
    fireEvent.click(screen.getByText('lobby.game.playAgain'))
    expect(play).toHaveBeenCalledWith('ui.confirm')
    expect(base.onPlayAgain).toHaveBeenCalled()
  })
})
