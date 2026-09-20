// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SketchAndGuessLobbyPage from '@/app/lobby/[code]/sketch-and-guess-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()

const broadcastHandlers: Record<string, (data: { payload: unknown }) => void> = {}
const mockChannel: any = {
  on: jest.fn((type: string, filter: { event?: string }, handler: (data: unknown) => void) => {
    if (type === 'broadcast' && filter.event) {
      broadcastHandlers[filter.event] = handler as any
    }
    return mockChannel
  }),
  subscribe: jest.fn(() => mockChannel),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
    guestId: null,
    guestName: null,
  }),
}))

// The real hook deliberately preserves the `t` reference across renders
// (lib/i18n-helpers.ts), because re-wrapping it makes every callback that depends on it
// unstable. A mock that returns a fresh `t` each render turns any such callback into a
// render loop and would make this suite fail for a reason unrelated to what it asserts.
jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    errorFrom: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    infoText: jest.fn(),
  },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackLobbyLeaveRedirect: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

// The board owns the guess input; the page only hands it a submit callback, so the mock
// exposes one button that calls it. `SketchScoreRows` is the page's scores panel body,
// which the page imports by name from the same module (#1034) – a default-only mock left
// it undefined and every render threw "Element type is invalid".
jest.mock('@/components/SketchAndGuessGameBoard', () => ({
  __esModule: true,
  default: ({ onSubmitGuess }: { onSubmitGuess: (guess: string) => void }) => (
    <div data-testid="sketch-board">
      <button onClick={() => onSubmitGuess('apple')}>guess</button>
    </div>
  ),
  SketchScoreRows: ({ players }: { players: Array<{ id: string; name: string }> }) => (
    <div data-testid="sketch-scores">{players.map((p) => p.name).join(',')}</div>
  ),
}))

jest.mock('@/components/Chat', () => ({
  __esModule: true,
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="sketch-chat" data-readonly={readOnly ? 'true' : 'false'} />
  ),
}))

jest.mock('@/components/ConfirmModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('@/components/ReactionOverlay', () => ({
  ReactionOverlay: () => null,
}))

jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

function buildLobbyResponse() {
  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'sketch_and_guess',
      creatorId: 'user-1',
      name: 'Lobby',
      isActive: true,
    },
    activeGame: {
      id: 'game-1',
      gameType: 'sketch_and_guess',
      status: 'playing',
      state: {
        data: {
          phase: 'guessing',
          currentRound: 1,
          totalRounds: 3,
          drawerOrder: ['user-1', 'user-2', 'user-3'],
          currentDrawerId: 'user-2',
          rounds: [],
          submittedPlayerIds: [],
          scores: {},
          scoreBreakdown: {},
          winnerId: null,
          ranking: [],
          completionReason: null,
          finishedAt: null,
          isMvpScaffold: false,
        },
      },
      players: [
        { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', name: 'Cara', user: { username: 'Cara' } },
      ],
    },
  }
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

describe('SketchAndGuessLobbyPage fallback states', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const toast = showToast as jest.Mocked<typeof showToast>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue(okResponse(buildLobbyResponse()))
  })

  it('loads behind the shared loading fallback, not a hardcoded viewport shell', async () => {
    const { container } = render(<SketchAndGuessLobbyPage code="ABCD" />)

    const root = container.firstChild as HTMLElement | null
    expect(root?.className).toContain('min-h-[var(--game-h)]')
    expect(container.innerHTML).not.toContain('min-h-[100dvh]')
    expect(container.innerHTML).not.toContain('from-sky-50')

    // Let the pending load settle so the state updates it schedules happen inside the test.
    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))
  })

  // A lobby that has been deleted or reaped answers 404. Keeping the last snapshot on screen
  // would leave the player on a board that can never update again, so the lobby is dropped.
  it('falls through to the shared error screen when the lobby is gone', async () => {
    mockFetchWithGuest.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Lobby not found' }) } as Response)

    const { container } = render(<SketchAndGuessLobbyPage code="ABCD" />)

    await waitFor(() => {
      expect(screen.queryByText('games.tictactoe.game.errorTitle')).not.toBeNull()
    })
    expect(toast.error).toHaveBeenCalledWith('errors.failedToLoad', undefined, undefined, { id: 'sketch-load-failed' })
    expect(container.innerHTML).not.toContain('min-h-[100dvh]')
  })

  // The other half of that split: a network blip is not a dead lobby, so the round survives it.
  it('keeps a live board when a background refresh fails', async () => {
    render(<SketchAndGuessLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))

    mockFetchWithGuest.mockRejectedValueOnce(new Error('Failed to fetch'))

    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { gameId: 'game-1' } })
    })

    expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0)
    expect(screen.queryByText('games.tictactoe.game.errorTitle')).toBeNull()
  })

  it('offers a way back to the lobby when the lobby has no active game', async () => {
    mockFetchWithGuest.mockResolvedValue(okResponse({ lobby: buildLobbyResponse().lobby }))

    render(<SketchAndGuessLobbyPage code="ABCD" />)

    await waitFor(() => {
      expect(screen.queryByText('games.tictactoe.game.gameNotStartedTitle')).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'game.ui.backToLobby' }))
    expect(mockPush).toHaveBeenCalledWith('/lobby/ABCD')
  })

  it('keeps a visitor who is not in the match on the game-height shell', async () => {
    const response = buildLobbyResponse()
    response.activeGame.players = [
      { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
      { id: 'player-3', userId: 'user-3', name: 'Cara', user: { username: 'Cara' } },
    ]
    mockFetchWithGuest.mockResolvedValue(okResponse(response))

    const { container } = render(<SketchAndGuessLobbyPage code="ABCD" />)

    await waitFor(() => {
      expect(screen.queryByText('lobby.game.notPartOfMatch')).not.toBeNull()
    })
    expect(container.innerHTML).toContain('h-[var(--game-h)]')
    expect(container.innerHTML).not.toContain('min-h-[100dvh]')
    // The card above it uses the same key, so the two screens read as one action.
    expect(screen.getByRole('button', { name: 'game.ui.backToLobby' })).not.toBeNull()
  })

  it('shows the board to a spectator who is not one of the players', async () => {
    const response = buildLobbyResponse()
    response.activeGame.players = [
      { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
      { id: 'player-3', userId: 'user-3', name: 'Cara', user: { username: 'Cara' } },
    ]
    mockFetchWithGuest.mockResolvedValue(okResponse(response))

    render(<SketchAndGuessLobbyPage code="ABCD" isSpectator />)

    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))
    expect(screen.queryByText('lobby.game.notPartOfMatch')).toBeNull()
  })

  // The defect this covers: submitAction used to write the failure into the same `error`
  // state the page guarded its whole render on, so one rejected guess replaced the live
  // round with a full-screen error card and nothing could clear it.
  it('keeps the board mounted when a guess is rejected', async () => {
    render(<SketchAndGuessLobbyPage code="ABCD" />)

    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))

    mockFetchWithGuest.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Guess already submitted' }),
    } as Response)

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'guess' })[0])
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('errors.general', undefined, { message: 'Guess already submitted' })
    })
    expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0)
  })

  // #1006 — submitAction read nothing before sending, so a second Enter while the
  // first guess was still out sent a second POST off the same read of the state.
  // isSubmitting could not have helped: an async callback reads the value from the
  // render it closed over.
  it('sends one guess when the player submits twice before the first lands', async () => {
    render(<SketchAndGuessLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))

    let settleGuess: (value: Response) => void = () => {}
    mockFetchWithGuest.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { settleGuess = resolve })
    )

    const guessCalls = () =>
      mockFetchWithGuest.mock.calls.filter((call) =>
        String(call[0]).includes('/sketch-and-guess-action')
      ).length

    fireEvent.click(screen.getAllByRole('button', { name: 'guess' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'guess' })[0])

    expect(guessCalls()).toBe(1)

    await act(async () => {
      settleGuess(okResponse({ state: null }))
    })
  })
})

/**
 * #1034 – the chrome contract. Each of these fails the moment a piece of
 * `components/game-chrome/` is dropped or hand-rolled again, which is the thing
 * the ticket calls a review blocker.
 */
describe('SketchAndGuessLobbyPage shared chrome', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue(okResponse(buildLobbyResponse()))
  })

  async function renderPage(mutate?: (response: ReturnType<typeof buildLobbyResponse>) => void, props = {}) {
    const response = buildLobbyResponse()
    mutate?.(response)
    mockFetchWithGuest.mockResolvedValue(okResponse(response))
    const view = render(<SketchAndGuessLobbyPage code="ABCD" {...props} />)
    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))
    return view
  }

  it('puts Leave inside the scoreboard header trailing slot, not a header of its own', async () => {
    const { container } = await renderPage()

    // The trailing slot is the header's right cell; a Leave button anywhere else
    // on the page is the hand-rolled corner this migration removed.
    const trailingLeave = container.querySelectorAll('.game-scoreboard-cell--right button.game-leave-button')
    expect(trailingLeave.length).toBeGreaterThan(0)
    expect(container.querySelectorAll('button.game-leave-button').length).toBe(trailingLeave.length)
  })

  it('gives a spectator the way back in that same slot and no Leave button', async () => {
    const { container } = await renderPage(
      (response) => {
        response.activeGame.players = [
          { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
          { id: 'player-3', userId: 'user-3', name: 'Cara', user: { username: 'Cara' } },
        ]
      },
      { isSpectator: true }
    )

    const back = container.querySelectorAll('.game-scoreboard-cell--right a.game-leave-button--back')
    expect(back.length).toBeGreaterThan(0)
    expect(back[0].getAttribute('href')).toBe('/lobby/ABCD')
    expect(container.querySelectorAll('button.game-leave-button').length).toBe(0)
  })

  it('renders the shared chat and the shared tab strip', async () => {
    const { container } = await renderPage()

    expect(screen.getAllByTestId('sketch-chat').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.game-tabs .game-tab').length).toBe(3)
    expect(screen.getAllByRole('button', { name: 'game.ui.tabChat' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'games.guess_my_drawing.game.standings' }).length).toBeGreaterThan(0)
  })

  // The drawer is paid 40 points per correct guess, so an open composer is a
  // channel they are rewarded for leaking the word down. Read-only until the reveal.
  it('closes the chat composer for the drawer while the word is still secret', async () => {
    await renderPage((response) => {
      response.activeGame.state.data.currentDrawerId = 'user-1'
      response.activeGame.state.data.phase = 'drawing'
    })

    for (const chat of screen.getAllByTestId('sketch-chat')) {
      expect(chat.getAttribute('data-readonly')).toBe('true')
    }
  })

  it('leaves the composer open for everyone who is guessing', async () => {
    await renderPage()

    for (const chat of screen.getAllByTestId('sketch-chat')) {
      expect(chat.getAttribute('data-readonly')).toBe('false')
    }
  })

  it('opens the composer to the drawer again at the reveal', async () => {
    await renderPage((response) => {
      response.activeGame.state.data.currentDrawerId = 'user-1'
      response.activeGame.state.data.phase = 'reveal'
    })

    for (const chat of screen.getAllByTestId('sketch-chat')) {
      expect(chat.getAttribute('data-readonly')).toBe('false')
    }
  })

  // The phase clock the engine enforces was invisible before #1034: 90s to draw
  // and 60s to guess ran down with nothing on screen. The numbers are written
  // out here rather than imported, so a change to SKETCH_PHASE_SECONDS has to
  // come back and change this line too.
  it('shows the drawing phase clock counting from 90 seconds', async () => {
    await renderPage((response) => {
      response.activeGame.state.data.phase = 'drawing'
    })

    await waitFor(() => expect(screen.getAllByText(':90').length).toBeGreaterThan(0))
  })

  it('shows the guessing phase clock counting from 60 seconds', async () => {
    await renderPage((response) => {
      response.activeGame.state.data.phase = 'guessing'
    })

    await waitFor(() => expect(screen.getAllByText(':60').length).toBeGreaterThan(0))
  })

  it('ends the game through the shared result overlay, with a rematch for the host', async () => {
    await renderPage((response) => {
      response.activeGame.status = 'finished'
      response.activeGame.state.data.phase = 'reveal'
      response.activeGame.state.data.winnerId = 'user-1'
      response.activeGame.state.data.ranking = ['user-1', 'user-2', 'user-3']
    })

    expect(screen.getAllByRole('button', { name: 'game.ui.viewBoard' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'lobby.game.playAgain' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'game.ui.returnToLobby' }).length).toBeGreaterThan(0)
  })

  it('sends the rematch to the same endpoint the waiting room uses', async () => {
    await renderPage((response) => {
      response.activeGame.status = 'finished'
      response.activeGame.state.data.phase = 'reveal'
      response.activeGame.state.data.winnerId = 'user-1'
    })

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'lobby.game.playAgain' })[0])
    })

    const rematchCalls = mockFetchWithGuest.mock.calls.filter((call) => String(call[0]) === '/api/game/create')
    expect(rematchCalls.length).toBe(1)
    expect(JSON.parse(String(rematchCalls[0][1]?.body))).toMatchObject({
      gameType: 'sketch_and_guess',
      lobbyId: 'lobby-1',
    })
  })
})
