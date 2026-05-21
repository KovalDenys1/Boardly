import { act, renderHook } from '@testing-library/react'
import { useBotTurn } from '@/app/lobby/[code]/hooks/useBotTurn'

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn() },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

import { fetchWithGuest } from '@/lib/fetch-with-guest'

const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

const WATCHDOG_MS = 14_000
const RETRY_DELAY_MS = 2_000

describe('useBotTurn watchdog', () => {
  const advanceAndFlush = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms)
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const botGame = {
    id: 'game-123',
    players: [
      { userId: 'player-1', user: { bot: null } },
      { userId: 'bot-1', user: { bot: { id: 'bot-1' } } },
    ],
  }

  const makeBotEngine = (botPlayerId = 'bot-1', playerIndex = 1) => ({
    getState: jest.fn(() => ({ status: 'playing', currentPlayerIndex: playerIndex })),
    getCurrentPlayer: jest.fn(() => ({ id: botPlayerId })),
  })

  it('fires watchdog after 14s when fetch never resolves, calls reconcile and schedules retry', async () => {
    // fetch never resolves — simulates a hung bot-turn request
    mockFetchWithGuest.mockReturnValue(new Promise(() => {}))
    const reconcileWithServerSnapshot = jest.fn().mockResolvedValue(undefined)
    const gameEngine = makeBotEngine() as any

    renderHook(() =>
      useBotTurn({
        game: botGame,
        gameEngine,
        code: 'ABCD12',
        isGameStarted: true,
        reconcileWithServerSnapshot,
      })
    )

    // fetchWithGuest should be called once immediately for the bot turn
    await advanceAndFlush(0)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)

    // Before watchdog fires, reconcile should not have been called
    expect(reconcileWithServerSnapshot).not.toHaveBeenCalled()

    // Advance past watchdog threshold
    await advanceAndFlush(WATCHDOG_MS + 100)
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(1)

    // Retry should be scheduled — advance past retry delay and expect a second fetch attempt
    await advanceAndFlush(RETRY_DELAY_MS + 100)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(2)
  })

  it('does not fire watchdog if fetch resolves before 14s', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as any)
    const reconcileWithServerSnapshot = jest.fn().mockResolvedValue(undefined)
    const gameEngine = makeBotEngine() as any

    renderHook(() =>
      useBotTurn({
        game: botGame,
        gameEngine,
        code: 'ABCD12',
        isGameStarted: true,
        reconcileWithServerSnapshot,
      })
    )

    await advanceAndFlush(0)
    await act(async () => { await Promise.resolve() })

    // Advance past watchdog — should not trigger since fetch already resolved
    await advanceAndFlush(WATCHDOG_MS + 100)
    expect(reconcileWithServerSnapshot).not.toHaveBeenCalled()
  })
})
