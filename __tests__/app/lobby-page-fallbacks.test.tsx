import { render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import { LobbyPageErrorFallback, LobbyPageLoadingFallback } from '@/app/lobby/[code]/components/LobbyPageFallbacks'

describe('LobbyPage fallback components', () => {
  it('renders loading fallback container', () => {
    const { container } = render(<LobbyPageLoadingFallback />)

    const root = container.firstChild as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root?.className).toContain('h-(--game-h)')
    expect(root?.hasAttribute('data-lobby-loader')).toBe(true)
    expect(screen.getByRole('status')).not.toBeNull()
  })

  it('starts the spinner on the document clock so a remounted loader keeps its angle', () => {
    const spin = { startTime: null as number | null }
    const original = HTMLElement.prototype.getAnimations
    HTMLElement.prototype.getAnimations = jest.fn(() => [spin as unknown as Animation])
    try {
      render(<LobbyPageLoadingFallback />)
    } finally {
      HTMLElement.prototype.getAnimations = original
    }

    expect(spin.startTime).toBe(0)
  })

  it('renders error fallback with action button', () => {
    render(<LobbyPageErrorFallback />)

    expect(screen.queryByText(i18n.t('games.tictactoe.game.errorTitle'))).not.toBeNull()
    expect(screen.queryByText(i18n.t('games.tictactoe.game.errorDescription'))).not.toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('games.tictactoe.game.backToLobbies') })).not.toBeNull()
  })
})
