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

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

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

// The board owns the guess input; the page only has to hand it a submit callback,
// so the mock exposes one button that calls it.
jest.mock('@/components/SketchAndGuessGameBoard', () => ({
  __esModule: true,
  default: ({ onSubmitGuess }: { onSubmitGuess: (guess: string) => void }) => (
    <div data-testid="sketch-board">
      <button onClick={() => onSubmitGuess('apple')}>guess</button>
    </div>
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

function buildLobbyResponse(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  }
}

describe('SketchAndGuessLobbyPage fallback states', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const toast = showToast as jest.Mocked<typeof showToast>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('uses the shared loading fallback, not a hardcoded viewport shell', async () => {
    const { container } = render(<SketchAndGuessLobbyPage code="ABCD" />)

    const root = container.firstChild as HTMLElement | null
    expect(root?.className).toContain('min-h-[var(--game-h)]')
    expect(container.innerHTML).not.toContain('min-h-[100dvh]')

    // Let the pending load settle so the state updates it schedules happen inside the test.
    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))
  })

  it('shows the shared error fallback when the lobby cannot be loaded', async () => {
    mockFetchWithGuest.mockResolvedValue({ ok: false, json: async () => ({}) } as Response)

    const { container } = render(<SketchAndGuessLobbyPage code="ABCD" />)

    await waitFor(() => {
      expect(screen.queryByText('games.tictactoe.game.errorTitle')).not.toBeNull()
    })
    expect(toast.error).toHaveBeenCalledWith('errors.failedToLoad')
    expect(container.innerHTML).not.toContain('min-h-[100dvh]')
  })

  it('offers a way back to the lobby when the lobby has no active game', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => ({ lobby: buildLobbyResponse().lobby }),
    } as Response)

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
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

    const { container } = render(<SketchAndGuessLobbyPage code="ABCD" />)

    await waitFor(() => {
      expect(screen.queryByText('lobby.game.notPartOfMatch')).not.toBeNull()
    })
    expect(container.innerHTML).toContain('h-[var(--game-h)]')
    expect(container.innerHTML).not.toContain('min-h-[100dvh]')
  })

  // The defect this covers: submitAction used to write the failure into the same
  // `error` state the page guarded its whole render on, so one rejected guess
  // replaced the live round with a full-screen error card and nothing could clear it.
  it('keeps the board mounted when a guess is rejected', async () => {
    render(<SketchAndGuessLobbyPage code="ABCD" />)

    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))

    mockFetchWithGuest.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Guess already submitted' }),
    } as Response)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'guess' }))
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('errors.general', undefined, { message: 'Guess already submitted' })
    })
    expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0)
    expect(screen.queryByText('games.tictactoe.game.errorTitle')).toBeNull()
  })
})
