import { render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import { LobbyPageErrorFallback, LobbyPageLoadingFallback } from '@/app/lobby/[code]/components/LobbyPageFallbacks'

describe('LobbyPage fallback components', () => {
  it('renders loading fallback container', () => {
    const { container } = render(<LobbyPageLoadingFallback />)

    const root = container.firstChild as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root?.className).toContain('min-h-screen')
  })

  it('renders error fallback with action button', () => {
    render(<LobbyPageErrorFallback />)

    expect(screen.queryByText(i18n.t('games.tictactoe.game.errorTitle'))).not.toBeNull()
    expect(screen.queryByText(i18n.t('games.tictactoe.game.errorDescription'))).not.toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('games.tictactoe.game.backToLobbies') })).not.toBeNull()
  })
})
