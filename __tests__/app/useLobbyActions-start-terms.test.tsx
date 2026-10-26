import { act, renderHook } from '@testing-library/react'
import { useLobbyActions } from '@/app/lobby/[code]/hooks/useLobbyActions'
import { showToast } from '@/lib/i18n-toast'
import { createFreshnessWatermark } from '@/lib/game-state-freshness'
import { readSketchCustomWordsSetting, writeSketchCustomWordsSetting } from '@/lib/sketch-custom-words'

jest.mock('@/lib/restore-game-engine-client', () => ({
  restoreGameEngineClient: jest.fn(),
}))

jest.mock('@/lib/auth-headers', () => ({
  getAuthHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
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

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}))

const mockedShowToast = showToast as jest.Mocked<typeof showToast>
const originalFetch = global.fetch
const mockFetch = jest.fn()

const customWords = Array.from({ length: 12 }, (_, i) => `word${i}`).join('\n')
const lobby = { id: 'lobby-123', code: 'ABCD', gameType: 'sketch_and_guess', maxPlayers: 10, turnTimer: 60, creatorId: 'host' }
const waitingGame = {
  id: 'game-123',
  status: 'waiting' as const,
  state: JSON.stringify({ phase: 'waiting' }),
  players: ['host', 'p2', 'p3'].map((userId) => ({ id: `player-${userId}`, userId, name: userId, score: 0, user: { id: userId, username: userId, bot: null } })),
}

function renderActions(acceptTerms: () => Promise<boolean>) {
  return renderHook(() =>
    useLobbyActions({
      code: 'ABCD',
      lobby: lobby as never,
      game: waitingGame as never,
      freshnessRef: { current: createFreshnessWatermark() },
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
      userId: 'host',
      username: 'host',
      setGuestMode: jest.fn().mockResolvedValue(undefined),
      setError: jest.fn(),
      setLoading: jest.fn(),
      setStartingGame: jest.fn(),
      selectedBotDifficulty: 'medium',
      acceptTerms,
    })
  )
}

describe('useLobbyActions – custom words before the terms (#1482)', () => {
  beforeAll(() => {
    ;(global as any).fetch = mockFetch
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
    writeSketchCustomWordsSetting({ text: customWords, only: true })
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (input === '/api/lobby/ABCD?includeFinished=true') {
        return { ok: true, json: async () => ({ lobby, activeGame: waitingGame }) } as Response
      }
      if (input === '/api/game/create') {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'Accept the terms before adding custom words', code: 'TERMS_REQUIRED' }),
        } as Response
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`)
    })
  })

  it('reports the terms as required instead of the generic start failure, and keeps the words', async () => {
    const { result } = renderActions(jest.fn())

    await act(async () => {
      await result.current.handleStartGame()
    })

    expect(result.current.startTermsRequired).toBe(true)
    expect(mockedShowToast.errorFrom).not.toHaveBeenCalled()
    const [, init] = mockFetch.mock.calls.find(([url]) => url === '/api/game/create')!
    expect(JSON.parse(String(init.body)).config.rules.customWords).toHaveLength(12)
    expect(readSketchCustomWordsSetting()).toEqual({ text: customWords, only: true })
  })

  it('clears it once the shared accept succeeds, and keeps it when the accept fails', async () => {
    const acceptTerms = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { result } = renderActions(acceptTerms)
    await act(async () => {
      await result.current.handleStartGame()
    })

    await act(async () => {
      expect(await result.current.acceptStartTerms()).toBe(false)
    })
    expect(result.current.startTermsRequired).toBe(true)

    await act(async () => {
      expect(await result.current.acceptStartTerms()).toBe(true)
    })
    expect(acceptTerms).toHaveBeenCalledTimes(2)
    expect(result.current.startTermsRequired).toBe(false)
  })
})
