import { render, screen } from '@testing-library/react'
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

    expect(screen.queryByText('Game Error')).not.toBeNull()
    expect(screen.queryByText('Something went wrong with the game lobby. Please try again.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to Lobbies' })).not.toBeNull()
  })
})
