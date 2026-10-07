// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/lobby/[code]/tic-tac-toe-page'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { frameFor, installSignedRealtime } from '@/__tests__/fixtures/signed-realtime'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()

installSignedRealtime()
const REALTIME_TOPIC = 'lobby:ABCD:test-secret'

const broadcastHandlers: Record<string, (data: { payload: unknown }) => void> = {}
const mockChannel: any = {
  on: jest.fn((type: string, filter: { event?: string }, handler: (data: unknown) => void) => {
    if (type === 'broadcast' && filter.event) {
      // Pages only act on what the server signed (GHSA-g868-9224-wr3p), so the
      // payloads these tests feed in are sealed on their way to the registry.
      const event = filter.event
      broadcastHandlers[event] = ((data: { payload: unknown }) =>
        handler({ payload: frameFor(REALTIME_TOPIC, event, data.payload) })) as any
    }
    return mockChannel
  }),
  subscribe: jest.fn(() => mockChannel),
}

// Next's router is the same object on every render; a fresh one per render
// would re-run every effect that depends on it, loadLobby's included.
jest.mock('next/navigation', () => {
  const router = {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
    prefetch: (...args: unknown[]) => mockPrefetch(...args),
  }
  return { useRouter: () => router }
})

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

  it('hides the undo and draw requests in a game against a bot (#1352)', async () => {
    const response = buildLobbyResponse()
    response.activeGame.players[1].user = { username: 'Bob', bot: { difficulty: 'easy' } }
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

    render(<TicTacToeLobbyPage code="ABCD" />)

    expect((await screen.findAllByRole('button', { name: 'game.ui.leave' })).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: /undo/i })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /draw/i })).toHaveLength(0)
  })

  describe("the finished banner names the viewer's result (#1340)", () => {
    /** X (user-1, the viewer) takes the top row, or O (user-2) takes the middle row. */
    function finishedResponse(winner: 'user-1' | 'user-2') {
      const response = buildLobbyResponse()
      const engine = new TicTacToeGame('game-1')
      engine.restoreState(response.activeGame.state)
      const moves: Array<[string, number, number]> = winner === 'user-1'
        ? [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 0, 1], ['user-2', 1, 1], ['user-1', 0, 2]]
        : [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 2, 2], ['user-2', 1, 1], ['user-1', 0, 2], ['user-2', 1, 2]]
      for (const [playerId, row, col] of moves) {
        engine.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })
      }
      response.activeGame.state = engine.getState()
      response.activeGame.status = engine.getState().status
      return response
    }

    it.each([
      ['user-1', 'win', 'game.ui.victoryBadge'],
      ['user-2', 'loss', 'game.ui.defeatBadge'],
    ] as const)('when %s wins the viewer sees %s', async (winner, outcome, badge) => {
      const response = finishedResponse(winner)
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

      render(<TicTacToeLobbyPage code="ABCD" />)

      const titles = await screen.findAllByTestId('game-status-title')
      expect(titles.every((el) => el.getAttribute('data-outcome') === outcome)).toBe(true)
      expect(titles[0].textContent).toContain(badge)
    })
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

  describe('a mark answered slowly by the server (#1288)', () => {
    it('pops once: the server copy of a settled mark does not pop again', async () => {
      render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())

      let answerMove: (response: Response) => void = () => {}
      mockFetchWithGuest.mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/state') && init?.method === 'POST') {
          return new Promise<Response>((resolve) => { answerMove = resolve })
        }
        return { ok: true, json: async () => buildLobbyResponse() } as Response
      })

      fireEvent.click(screen.getAllByRole('button', { name: 'cell A1' })[0])
      const popHosts = () => document.querySelectorAll('.ttt-mark-pop-host')
      await waitFor(() => expect(popHosts().length).toBeGreaterThan(0))
      popHosts().forEach((host) => fireEvent.animationEnd(host))
      expect(popHosts()).toHaveLength(0)

      const server = new TicTacToeGame('game-1')
      server.restoreState(buildLobbyResponse().activeGame.state)
      server.makeMove({ playerId: 'user-1', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date(Date.now() + 600) })
      await act(async () => {
        answerMove({ ok: true, status: 200, json: async () => ({ game: { state: server.getState(), status: 'playing' } }) } as Response)
      })

      await waitFor(() => expect(mockFetchWithGuest).toHaveBeenCalledWith('/api/game/game-1/state', expect.anything()))
      expect(popHosts()).toHaveLength(0)
    })
  })
})
