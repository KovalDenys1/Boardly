import { act, renderHook } from '@testing-library/react'
import { useLobbyActions } from '@/app/lobby/[code]/hooks/useLobbyActions'

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    success: jest.fn(),
    errorFrom: jest.fn(),
    custom: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}))

jest.mock('@/lib/sounds', () => ({ sounds: { play: jest.fn() } }))
jest.mock('@/lib/auth-headers', () => ({ getAuthHeaders: jest.fn(() => ({})) }))
jest.mock('@/lib/restore-game-engine-client', () => ({ restoreGameEngineClient: jest.fn() }))
jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))
jest.mock('@/lib/lobby-snapshot', () => ({ normalizeLobbySnapshotResponse: jest.fn(() => ({ lobby: null, activeGame: null })) }))
jest.mock('@/lib/lobby-player-requirements', () => ({
  getLobbyPlayerRequirements: jest.fn(() => ({
    gameType: 'yahtzee',
    minPlayersRequired: 1,
    desiredPlayerCount: 1,
    supportsBots: false,
  })),
}))
jest.mock('@/lib/analytics', () => ({
  trackAuth: jest.fn(),
  trackFunnelStep: jest.fn(),
  trackLobbyJoined: jest.fn(),
  trackGameStarted: jest.fn(),
  trackStartAloneAutoBotResult: jest.fn(),
}))

jest.mock('@/i18n', () => {
  const i18nMock = { t: jest.fn((k: string) => k) }
  return { __esModule: true, default: i18nMock }
})

import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { showToast } from '@/lib/i18n-toast'

const mockRestoreGameEngineClient = restoreGameEngineClient as jest.MockedFunction<typeof restoreGameEngineClient>

const makeLobby = () => ({
  id: 'lobby-1',
  code: 'ABCD12',
  gameType: 'yahtzee',
  isPrivate: false,
  maxPlayers: 4,
  turnTimer: 60,
  allowSpectators: false,
  players: [{ userId: 'player-1', name: 'Alice', user: { bot: null } }],
})

const makeGame = () => ({
  id: 'game-123',
  state: null,
  players: [{ userId: 'player-1', name: 'Alice', score: 0, user: { bot: null } }],
})

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  code: 'ABCD12',
  lobby: makeLobby() as any,
  game: makeGame() as any,
  setGame: jest.fn(),
  setLobby: jest.fn(),
  setGameEngine: jest.fn(),
  setTimerActive: jest.fn(),
  setTimeLeft: jest.fn(),
  setRollHistory: jest.fn(),
  setCelebrationEvent: jest.fn(),
  setChatMessages: jest.fn(),
  isGuest: false,
  guestId: null,
  guestName: null,
  guestToken: null,
  userId: 'player-1',
  username: 'Alice',
  setGuestMode: jest.fn().mockResolvedValue(undefined),
  setError: jest.fn(),
  setLoading: jest.fn(),
  setStartingGame: jest.fn(),
  selectedBotDifficulty: 'medium' as const,
  ...overrides,
})

describe('useLobbyActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  describe('addBotToLobby', () => {
    it('200 response → returns success with botName and botDifficulty', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ bot: { username: 'BotAlpha', difficulty: 'easy' } }),
      })

      const { result } = renderHook(() => useLobbyActions(makeProps()))
      let returnValue: any
      await act(async () => { returnValue = await result.current.addBotToLobby() })

      expect(returnValue).toMatchObject({ success: true, botName: 'BotAlpha', botDifficulty: 'easy' })
      expect(showToast.success).toHaveBeenCalled()
    })

    it('server error → returns { success: false } and shows error toast', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Bot limit reached' }),
      })

      const { result } = renderHook(() => useLobbyActions(makeProps()))
      let returnValue: any
      await act(async () => { returnValue = await result.current.addBotToLobby() })

      expect(returnValue).toEqual({ success: false })
      expect(showToast.errorFrom).toHaveBeenCalled()
    })
  })

  describe('kickPlayer', () => {
    it('200 response → shows success toast', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
      // second fetch for loadLobby (via loadLobbyRef) – not wired in isolation, so no second call needed

      const { result } = renderHook(() => useLobbyActions(makeProps()))
      await act(async () => { await result.current.kickPlayer('player-2') })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('kick-player'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(showToast.success).toHaveBeenCalledWith('toast.playerKicked')
    })
  })

  describe('handleStartGame', () => {
    it('enough players → setGameEngine and setGame called after successful game create', async () => {
      const mockEngine = {}
      mockRestoreGameEngineClient.mockResolvedValue(mockEngine as any)

      ;(global.fetch as jest.Mock)
        // Snapshot fetch fails → hook falls back to lobby/game from props
        .mockRejectedValueOnce(new Error('network error'))
        // Game create fetch succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            game: {
              id: 'game-456',
              state: '{}',
              players: [{ userId: 'player-1', name: 'Alice', user: { bot: null } }],
            },
          }),
        })

      const setGameEngine = jest.fn()
      const setGame = jest.fn()
      const props = makeProps({ setGameEngine, setGame })

      const { result } = renderHook(() => useLobbyActions(props))
      await act(async () => { await result.current.handleStartGame() })

      expect(setGameEngine).toHaveBeenCalledWith(mockEngine)
      expect(setGame).toHaveBeenCalled()
    })
  })
})
