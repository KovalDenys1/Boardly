import { render, screen, fireEvent } from '@testing-library/react'
import GameResultOverlay from '@/components/game-chrome/GameResultOverlay'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/components/GuestConversionNudge', () => {
  return function MockNudge() {
    return <div data-testid="guest-nudge" />
  }
})

const mockShare = jest.fn()
jest.mock('@/hooks/useInviteShare', () => ({
  useInviteShare: () => mockShare,
}))

describe('GameResultOverlay (#736 phase 2)', () => {
  const base = {
    title: 'Alice wins!',
    onInspect: jest.fn(),
    isHost: true,
    onPlayAgain: jest.fn(),
    onReturnToLobby: jest.fn(),
    onLeave: jest.fn(),
  }

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

  it('offers the share CTA only when a lobby code is given (#927)', () => {
    const { unmount } = render(<GameResultOverlay {...base} />)
    expect(screen.queryByText('game.ui.playAgainWithFriends')).toBeNull()
    unmount()

    render(<GameResultOverlay {...base} inviteCode="AB12" />)
    fireEvent.click(screen.getByText('game.ui.playAgainWithFriends'))
    expect(mockShare).toHaveBeenCalledWith('result_overlay')
  })

  it('keeps the share CTA for non-hosts, who can still pull a friend in (#927)', () => {
    render(<GameResultOverlay {...base} isHost={false} inviteCode="AB12" />)
    expect(screen.getByText('game.ui.playAgainWithFriends')).toBeTruthy()
  })

  it('shows the waiting plate instead of actions for non-hosts', () => {
    render(<GameResultOverlay {...base} isHost={false} />)
    expect(screen.getByText('game.ui.waitingForHost')).toBeTruthy()
    expect(screen.queryByText('lobby.game.playAgain')).toBeNull()
    expect(screen.queryByText('game.ui.returnToLobby')).toBeNull()
    // Leave stays available to everyone
    expect(screen.getByText('game.ui.leave')).toBeTruthy()
  })

  it('disables Play Again while loading (double-submit guard)', () => {
    const onPlayAgain = jest.fn()
    render(<GameResultOverlay {...base} onPlayAgain={onPlayAgain} isLoading />)
    const btn = screen.getByText('…').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onPlayAgain).not.toHaveBeenCalled()
  })

  it('supports a custom kicker and actionsReplacement', () => {
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
  })

  it('shows the guest nudge only for guests with a registerUrl', () => {
    const { rerender } = render(<GameResultOverlay {...base} isGuest registerUrl="/auth/register" />)
    expect(screen.getByTestId('guest-nudge')).toBeTruthy()
    rerender(<GameResultOverlay {...base} isGuest={false} />)
    expect(screen.queryByTestId('guest-nudge')).toBeNull()
  })

  it('renders the draw handshake instead of the trophy', () => {
    render(<GameResultOverlay {...base} title="It's a draw" isDraw />)
    expect(document.querySelector('[data-icon="handshake"]')).toBeTruthy()
    expect(screen.queryByText('🏆')).toBeNull()
  })
})
