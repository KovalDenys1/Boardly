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
import { showToast } from '@/lib/i18n-toast'

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

    // Advance past the watchdog. It must not fire — which shows as no retry,
    // since a fired watchdog force-unlocks and schedules a second attempt.
    // Reconciling once is the success path doing its job (#859), not the
    // watchdog.
    await advanceAndFlush(WATCHDOG_MS + RETRY_DELAY_MS + 200)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)
  })

  it('reconciles after a successful bot turn, rather than trusting a broadcast', async () => {
    // The route answers 200 once the move is applied, and sends the new state
    // on a fire-and-forget broadcast whose result it discards. Without this
    // reconcile a broadcast that never landed left the board on the bot's turn
    // forever, while the server had moved on to the human — who then lost on
    // time for a turn they were never shown (#859).
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, currentPlayerIndex: 0 }),
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

    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(1)
  })

  it('reconciles and clears the tracked turn after the last retry fails', async () => {
    // #1002: this was the only failure path that neither reconciled nor cleared
    // the refs, so isSameTurn stayed true and the monitor never fired again —
    // the board sat on the bot's turn until a broadcast happened to land.
    mockFetchWithGuest.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error', code: 'BOT_TURN_FAILED' }),
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

    // The first attempt plus MAX_BOT_RETRIES (2) retries, each on its own delay.
    await advanceAndFlush(0)
    await act(async () => { await Promise.resolve() })
    await advanceAndFlush(RETRY_DELAY_MS + 100)
    await act(async () => { await Promise.resolve() })
    await advanceAndFlush(RETRY_DELAY_MS + 100)
    await act(async () => { await Promise.resolve() })

    expect(mockFetchWithGuest).toHaveBeenCalledTimes(3)
    expect(showToast.error).toHaveBeenCalledWith('toast.botMoveFailed')
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(1)
  })

  it('does not reconcile when it was not the bot\'s turn after all', async () => {
    // A 400 "Not bot's turn" means somebody else already moved it along; there
    // is nothing to recover and a reconcile would only add a request.
    mockFetchWithGuest.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Not bot's turn" }),
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

    expect(reconcileWithServerSnapshot).not.toHaveBeenCalled()
  })
})
