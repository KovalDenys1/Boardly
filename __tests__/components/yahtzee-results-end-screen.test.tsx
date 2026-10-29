import { render, screen, fireEvent, within } from '@testing-library/react'
import YahtzeeResults from '@/components/YahtzeeResults'
import { analyzeResults } from '@/lib/yahtzee-results'
import { resetResultOverlayRevealState } from '@/components/game-chrome/GameResultOverlay'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const ask = jest.fn()
jest.mock('@/hooks/useRematchSignal', () => ({
  useRematchSignal: () => ({ requestedBy: null, askState: 'idle', ask }),
}))

function renderResults(
  totals: Record<string, number>,
  currentUserId: string,
  props: Partial<React.ComponentProps<typeof YahtzeeResults>> = {},
) {
  const results = analyzeResults(
    Object.entries(totals).map(([id, score]) => ({ id, name: id, score })),
    (id) => ({ chance: totals[id] }),
  )
  return render(
    <YahtzeeResults
      results={results}
      currentUserId={currentUserId}
      canStartGame
      onPlayAgain={jest.fn()}
      onBackToLobby={jest.fn()}
      {...props}
    />,
  )
}

const resultDialog = () => screen.findByRole('dialog', {}, { timeout: 2000 })

beforeEach(() => {
  jest.clearAllMocks()
  resetResultOverlayRevealState()
})

describe('YahtzeeResults end screen (#1578, #1564)', () => {
  it('opens the shared result dialog over the scorecard: winner, both scores, Play again', async () => {
    const onPlayAgain = jest.fn()
    renderResults({ Alpha: 120, Bravo: 95 }, 'Alpha', { onPlayAgain })

    const dialog = await resultDialog()
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'You Won!' })).toBe(dialog)
    expect(dialog.getAttribute('data-outcome')).toBe('win')
    const standings = within(dialog).getByTestId('game-result-standings')
    expect(standings.textContent).toContain('120')
    expect(standings.textContent).toContain('95')

    fireEvent.click(within(dialog).getByRole('button', { name: /play again/i }))
    expect(onPlayAgain).toHaveBeenCalledTimes(1)
  })

  it('shows at most three actions, with leaving and the after-game extras behind More', async () => {
    const onBackToLobby = jest.fn()
    renderResults({ Alpha: 120, Bravo: 95 }, 'Alpha', { onBackToLobby, lobbyCode: 'ABCD', isGuest: true })

    const dialog = await resultDialog()
    expect(within(dialog).getAllByRole('button')).toHaveLength(3)
    expect(within(dialog).queryByText('Back to Lobbies')).toBeNull()

    fireEvent.click(within(dialog).getByTestId('game-result-more-button'))
    const more = within(dialog).getByTestId('game-result-more')
    fireEvent.click(within(more).getByRole('button', { name: 'Leave' }))
    expect(onBackToLobby).toHaveBeenCalledTimes(1)
  })

  it('keeps no action row of its own on the page behind the dialog', async () => {
    renderResults({ Alpha: 120, Bravo: 95 }, 'Alpha', { lobbyCode: 'ABCD', isGuest: true })

    const dialog = await resultDialog()
    const playAgain = screen.getAllByRole('button', { name: /play again/i, hidden: true })
    expect(playAgain).toHaveLength(1)
    expect(dialog.contains(playAgain[0])).toBe(true)
    expect(screen.queryByTestId('after-game-actions')).toBeNull()
  })

  it('reads a tie as a draw and a lost game as a loss', async () => {
    const { unmount } = renderResults({ Alpha: 120, Bravo: 120 }, 'Alpha')
    expect((await resultDialog()).getAttribute('data-outcome')).toBe('draw')
    expect(screen.getByRole('dialog', { name: "It's a Tie!" })).toBeTruthy()
    unmount()
    resetResultOverlayRevealState()

    renderResults({ Alpha: 120, Bravo: 95 }, 'Bravo')
    expect((await resultDialog()).getAttribute('data-outcome')).toBe('loss')
    expect(screen.getByRole('dialog', { name: 'Alpha Wins!' })).toBeTruthy()
  })

  it('ranks three or more players in the dialog', async () => {
    renderResults({ Alpha: 120, Bravo: 95, Charlie: 140 }, 'Bravo')

    const standings = within(await resultDialog()).getByTestId('game-result-standings')
    expect(standings.getAttribute('data-layout')).toBe('ranked')
    expect(within(standings).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Charlie'),
      expect.stringContaining('Alpha'),
      expect.stringContaining('Bravo'),
    ])
  })

  it('shows a solo game its own score', async () => {
    renderResults({ Alpha: 187 }, 'Alpha')

    const standings = within(await resultDialog()).getByTestId('game-result-standings')
    expect(standings.textContent).toContain('187')
  })

  it('lets a guest who is not the host ask for a rematch as the main action', async () => {
    renderResults({ Alpha: 120, Bravo: 95 }, 'Bravo', {
      canStartGame: false,
      canRequestRematch: true,
      lobbyCode: 'ABCD',
      isGuest: true,
    })

    fireEvent.click(within(await resultDialog()).getByRole('button', { name: 'Ask for a rematch' }))
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('View board closes the dialog to the scorecard, and Show results brings it back', async () => {
    renderResults({ Alpha: 120, Bravo: 95 }, 'Alpha')

    fireEvent.click(within(await resultDialog()).getByRole('button', { name: 'View Board' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('yahtzee-results-leader')).toBeTruthy()
    const showResults = screen.getByRole('button', { name: 'Show results' })
    expect(document.activeElement).toBe(showResults)

    fireEvent.click(showResults)
    expect(await resultDialog()).toBeTruthy()
  })

  it('offers a seated non-host the way back to the lobby room behind More', async () => {
    const onReturnToLobbyRoom = jest.fn()
    renderResults({ Alpha: 120, Bravo: 95 }, 'Bravo', { canStartGame: false, onReturnToLobbyRoom })

    const dialog = await resultDialog()
    fireEvent.click(within(dialog).getByTestId('game-result-more-button'))
    fireEvent.click(within(within(dialog).getByTestId('game-result-more')).getByRole('button', { name: 'Return to Lobby' }))
    expect(onReturnToLobbyRoom).toHaveBeenCalledTimes(1)
  })
})
