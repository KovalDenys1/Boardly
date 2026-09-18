// @ts-nocheck
import { act, render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/lobby/[code]/tic-tac-toe-page'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
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
    data: {
      user: {
        id: 'user-1',
      },
    },
    status: 'authenticated',
  }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
    guestId: null,
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
    debug: jest.fn(),
  },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackLobbyLeaveRedirect: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/components/ConfirmModal', () => ({
  __esModule: true,
  default: () => null,
}))

// The realtime topic carries a per-lobby secret and is fetched from the server
// (#845). Supabase itself is mocked below, so the name only has to be stable.
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
  const engine = new TicTacToeGame('game-1')
  engine.addPlayer({
    id: 'user-1',
    name: 'Alice',
    score: 0,
    isActive: true,
  })
  engine.addPlayer({
    id: 'user-2',
    name: 'Bob',
    score: 0,
    isActive: true,
  })
  engine.startGame()

  const activeGame = {
    id: 'game-1',
    status: 'playing',
    currentTurn: 0,
    state: engine.getState(),
    players: [
      {
        id: 'player-1',
        userId: 'user-1',
        name: 'Alice',
        user: {
          username: 'Alice',
        },
      },
      {
        id: 'player-2',
        userId: 'user-2',
        name: 'Bob',
        user: {
          username: 'Bob',
        },
      },
    ],
  }

  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'tic_tac_toe',
      creatorId: 'user-1',
      name: 'Lobby',
      isActive: false,
    },
    activeGame,
  }
}

/** Two moves played, back on user-1's turn, with `requesterId` waiting on an answer. */
function buildLobbyResponseWithDrawOffer(requesterId: string) {
  const response = buildLobbyResponse()
  const engine = new TicTacToeGame('game-1')
  engine.restoreState(response.activeGame.state)

  engine.makeMove({ playerId: 'user-1', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
  engine.makeMove({ playerId: 'user-2', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
  engine.makeMove({ playerId: requesterId, type: 'request-draw', data: {}, timestamp: new Date() })

  response.activeGame.state = engine.getState()
  return response
}

describe('TicTacToeLobbyPage', () => {
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

  it('redirects away when a game-abandoned broadcast is received', async () => {
    render(<TicTacToeLobbyPage code="ABCD" />)

    await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())

    act(() => {
      broadcastHandlers['game-abandoned']?.({
        payload: {
          gameId: 'game-1',
          reason: 'insufficient_players',
        },
      })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'lobby.gameAbandoned',
        undefined,
        undefined,
        { id: 'ttt-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('shows active match controls including undo, draw, and leave lobby', async () => {
    render(<TicTacToeLobbyPage code="ABCD" />)

    expect((await screen.findAllByRole('button', { name: /undo/i })).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /draw/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'game.ui.leave' }).length).toBeGreaterThan(0)
  })

  describe('an unanswered draw offer (#997)', () => {
    it('leaves the board playable for the player who made the offer', async () => {
      const response = buildLobbyResponseWithDrawOffer('user-1')
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => response,
      } as Response)

      render(<TicTacToeLobbyPage code="ABCD" />)

      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
      // Playing on withdraws the offer, so the opponent ignoring it cannot pin
      // the requester on a board they are not allowed to touch.
      screen.getAllByRole('button', { name: 'cell C3' }).forEach((cell) => {
        expect(cell.disabled).toBe(false)
      })
    })

    it('holds the board for the player who has to answer it', async () => {
      const response = buildLobbyResponseWithDrawOffer('user-2')
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => response,
      } as Response)

      render(<TicTacToeLobbyPage code="ABCD" />)

      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
      screen.getAllByRole('button', { name: 'cell C3' }).forEach((cell) => {
        expect(cell.disabled).toBe(true)
      })
    })
  })
})
