import { act, renderHook, waitFor } from '@testing-library/react'
import { useLobbyActions } from '@/app/lobby/[code]/hooks/useLobbyActions'
import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { showToast } from '@/lib/i18n-toast'

jest.mock('@/lib/restore-game-engine-client', () => ({
  restoreGameEngineClient: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  getAuthHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
  })),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/analytics', () => ({
  trackAuth: jest.fn(),
  trackError: jest.fn(),
  trackFunnelStep: jest.fn(),
  trackLobbyJoined: jest.fn(),
  trackGameStarted: jest.fn(),
  trackStartAloneAutoBotResult: jest.fn(),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    loading: jest.fn(),
    dismiss: jest.fn(),
    error: jest.fn(),
    errorFrom: jest.fn(),
    success: jest.fn(),
  },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

const mockRestoreGameEngineClient = restoreGameEngineClient as jest.MockedFunction<
  typeof restoreGameEngineClient
>
const mockedShowToast = showToast as jest.Mocked<typeof showToast>

const originalFetch = global.fetch
const mockFetch = jest.fn()

function createPlayer(userId: string, username: string, options?: { isBot?: boolean }) {
  return {
    id: `player-${userId}`,
    userId,
    name: username,
    score: 0,
    user: {
      id: userId,
      username,
      bot: options?.isBot
        ? {
            id: `bot-${userId}`,
            userId,
            botType: 'tic_tac_toe',
            difficulty: 'medium',
          }
        : null,
    },
  }
}

function createWaitingGame(players: ReturnType<typeof createPlayer>[]) {
  return {
    id: 'game-123',
    status: 'waiting' as const,
    state: JSON.stringify({ phase: 'waiting' }),
    players,
  }
}

function createStartedGame(players: ReturnType<typeof createPlayer>[]) {
  return {
    id: 'game-123',
    status: 'playing' as const,
    state: JSON.stringify({ phase: 'playing' }),
    players,
    currentTurn: 0,
  }
}

describe('useLobbyActions', () => {
  beforeAll(() => {
    ;(global as any).fetch = mockFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockRestoreGameEngineClient.mockResolvedValue({} as never)
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  it('refreshes the authoritative lobby snapshot before deciding to auto-add a bot', async () => {
    const staleGame = createStartedGame([createPlayer('creator-123', 'Host')])
    const authoritativeWaitingGame = {
      ...createWaitingGame([
        createPlayer('creator-123', 'Host'),
        createPlayer('user-456', 'Guest'),
      ]),
      // Missing currentTurn is the stale waiting-room shape that should still reconcile.
      currentTurn: undefined,
    }
    const startedGame = createStartedGame([
      createPlayer('creator-123', 'Host'),
      createPlayer('user-456', 'Guest'),
    ])

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (input === '/api/lobby/ABCD?includeFinished=true') {
        return {
          ok: true,
          json: async () => ({
            lobby: {
              id: 'lobby-123',
              code: 'ABCD',
              gameType: 'tic_tac_toe',
              maxPlayers: 2,
              turnTimer: 60,
            },
            activeGame: authoritativeWaitingGame,
          }),
        } as Response
      }

      if (input === '/api/game/create') {
        return {
          ok: true,
          json: async () => ({ game: startedGame }),
        } as Response
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`)
    })

    const setGame = jest.fn()
    const setGameEngine = jest.fn()

    const { result } = renderHook(() =>
      useLobbyActions({
        code: 'ABCD',
        lobby: {
          id: 'lobby-123',
          code: 'ABCD',
          gameType: 'tic_tac_toe',
          maxPlayers: 2,
          turnTimer: 60,
          creatorId: 'creator-123',
        },
        game: staleGame as any,
        setGame,
        setLobby: jest.fn(),
        setGameEngine,
        setTimerActive: jest.fn(),
        setTimeLeft: jest.fn(),
        setRollHistory: jest.fn(),
        setCelebrationEvent: jest.fn(),
        setChatMessages: jest.fn(),
        socket: null,
        isGuest: false,
        guestId: null,
        guestName: null,
        guestToken: null,
        userId: 'creator-123',
        username: 'Host',
        setGuestMode: jest.fn().mockResolvedValue(undefined),
        setError: jest.fn(),
        setLoading: jest.fn(),
        setStartingGame: jest.fn(),
        selectedBotDifficulty: 'medium',
      })
    )

    await act(async () => {
      await result.current.handleStartGame()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/game/create',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(
      mockFetch.mock.calls.some(([url]) => url === '/api/lobby/ABCD/add-bot')
    ).toBe(false)
    expect(setGame).toHaveBeenCalledWith(startedGame)
    expect(setGameEngine).toHaveBeenCalled()
    expect(mockedShowToast.error).not.toHaveBeenCalledWith('toast.botAddFailed')
  })

  it('reconciles stale lobby state after bot-add failure and still starts when a second human already joined', async () => {
    const initialWaitingGame = createWaitingGame([createPlayer('creator-123', 'Host')])
    const reconciledWaitingGame = createWaitingGame([
      createPlayer('creator-123', 'Host'),
      createPlayer('user-456', 'Guest'),
    ])
    const startedGame = createStartedGame([
      createPlayer('creator-123', 'Host'),
      createPlayer('user-456', 'Guest'),
    ])

    let lobbyFetchCount = 0
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (input === '/api/lobby/ABCD?includeFinished=true') {
        lobbyFetchCount += 1
        return {
          ok: true,
          json: async () => ({
            lobby: {
              id: 'lobby-123',
              code: 'ABCD',
              gameType: 'tic_tac_toe',
              maxPlayers: 2,
              turnTimer: 60,
            },
            activeGame: lobbyFetchCount === 1 ? initialWaitingGame : reconciledWaitingGame,
          }),
        } as Response
      }

      if (input === '/api/lobby/ABCD/add-bot') {
        return {
          ok: false,
          json: async () => ({ error: 'Lobby is full' }),
        } as Response
      }

      if (input === '/api/game/create') {
        return {
          ok: true,
          json: async () => ({ game: startedGame }),
        } as Response
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`)
    })

    const setGame = jest.fn()

    const { result } = renderHook(() =>
      useLobbyActions({
        code: 'ABCD',
        lobby: {
          id: 'lobby-123',
          code: 'ABCD',
          gameType: 'tic_tac_toe',
          maxPlayers: 2,
          turnTimer: 60,
          creatorId: 'creator-123',
        },
        game: initialWaitingGame as any,
        setGame,
        setLobby: jest.fn(),
        setGameEngine: jest.fn(),
        setTimerActive: jest.fn(),
        setTimeLeft: jest.fn(),
        setRollHistory: jest.fn(),
        setCelebrationEvent: jest.fn(),
        setChatMessages: jest.fn(),
        socket: null,
        isGuest: false,
        guestId: null,
        guestName: null,
        guestToken: null,
        userId: 'creator-123',
        username: 'Host',
        setGuestMode: jest.fn().mockResolvedValue(undefined),
        setError: jest.fn(),
        setLoading: jest.fn(),
        setStartingGame: jest.fn(),
        selectedBotDifficulty: 'medium',
      })
    )

    await act(async () => {
      await result.current.handleStartGame()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/game/create',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(
      mockFetch.mock.calls.filter(([url]) => url === '/api/lobby/ABCD/add-bot')
    ).toHaveLength(1)
    expect(setGame).toHaveBeenCalledWith(startedGame)
    expect(mockedShowToast.error).not.toHaveBeenCalledWith('toast.botAddFailed')
    expect(mockedShowToast.errorFrom).not.toHaveBeenCalled()
  })
})
