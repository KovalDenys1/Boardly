import { render, screen, fireEvent } from '@testing-library/react'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'

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

  it('renders the draw handshake instead of the trophy', () => {
    render(<GameResultOverlay {...base} title="It's a draw" isDraw />)
    expect(document.querySelector('[data-icon="handshake"]')).toBeTruthy()
    expect(screen.queryByText('🏆')).toBeNull()
  })
})
