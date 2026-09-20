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
// Mirrors SERVER_TRIGGER_GRACE_MS in the hook. Written out rather than imported:
// importing it would make every assertion below agree with whatever the hook says.
const SERVER_TRIGGER_GRACE_MS = 2_500

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

  const makeBotEngine = (botPlayerId = 'bot-1', playerIndex = 1, lastMoveAt = 1000) => ({
    getState: jest.fn(() => ({ status: 'playing', currentPlayerIndex: playerIndex, lastMoveAt })),
    getCurrentPlayer: jest.fn(() => ({ id: botPlayerId })),
  })

  const makeHumanTurnEngine = (lastMoveAt = 5000) => ({
    getState: jest.fn(() => ({ status: 'playing', currentPlayerIndex: 0, lastMoveAt })),
    getCurrentPlayer: jest.fn(() => ({ id: 'player-1' })),
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

    // Nothing goes out while the server's own trigger has the turn (#1049).
    await advanceAndFlush(0)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS)
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

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS)
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

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS)
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
    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS)
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

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS)
    await act(async () => { await Promise.resolve() })

    expect(reconcileWithServerSnapshot).not.toHaveBeenCalled()
  })

  it('sends nothing when the server-side trigger plays the turn first (#1049)', async () => {
    // What a bot turn looked like in the browser before this: the human's move
    // returns, POST /api/game/[gameId]/state fires its own trigger from after(),
    // and this hook fired at the same instant - so the route's in-memory lock
    // answered one of them 409 for a turn that was being played correctly.
    // Verified live on 2026-09-20 against a tic-tac-toe game vs an Easy bot:
    //   POST /bot-turn 409 {"error":"Bot turn already in progress"}
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => ({}) } as any)
    const gameEngine = makeBotEngine() as any

    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: botGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
        }),
      { initialProps: { engine: gameEngine } }
    )

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS - 500)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()

    // The server-side trigger's bot move lands and the turn goes back to the human.
    rerender({ engine: makeHumanTurnEngine() as any })
    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS * 3)

    expect(mockFetchWithGuest).not.toHaveBeenCalled()
  })

  it('re-arms instead of firing while the bot turn is visibly progressing', async () => {
    // A Memory bot commits one flip at a time inside a single turn, so the seat does
    // not change but lastMoveAt does. Firing on the original timer would land on a
    // turn that is already running and take another 409.
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => ({}) } as any)

    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: botGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
        }),
      { initialProps: { engine: makeBotEngine('bot-1', 1, 1000) as any } }
    )

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS - 400)
    rerender({ engine: makeBotEngine('bot-1', 1, 2000) as any })
    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS - 400)
    rerender({ engine: makeBotEngine('bot-1', 1, 3000) as any })
    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS - 400)

    expect(mockFetchWithGuest).not.toHaveBeenCalled()
  })

  it('triggers a bot that follows another bot at once, because nothing chains them', async () => {
    // The state route triggers a bot after a human's move and the create route after
    // the first deal. Bot to bot has no server-side driver, so waiting out the grace
    // there would only make every bot-vs-bot turn slower.
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => ({}) } as any)
    const threeSeatGame = {
      id: 'game-123',
      players: [
        { userId: 'player-1', user: { bot: null } },
        { userId: 'bot-1', user: { bot: { id: 'bot-1' } } },
        { userId: 'bot-2', user: { bot: { id: 'bot-2' } } },
      ],
    }

    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: threeSeatGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
        }),
      { initialProps: { engine: makeBotEngine('bot-1', 1, 1000) as any } }
    )

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)

    rerender({ engine: makeBotEngine('bot-2', 2, 2000) as any })
    await advanceAndFlush(10)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(2)
    expect(mockFetchWithGuest.mock.calls[1][1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ botUserId: 'bot-2', lobbyCode: 'ABCD12' }) })
    )
  })

  it('does not POST again after a 409 - it reconciles and lets the state decide (#1049)', async () => {
    // The 409 handler used to clear the refs and POST again two seconds later. By
    // then the bot had moved and the turn was back with the human, so the retry came
    // back 400 "Not bot's turn" - the third wasted write of every bot turn.
    mockFetchWithGuest.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Bot turn already in progress' }),
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

    await advanceAndFlush(SERVER_TRIGGER_GRACE_MS)
    await act(async () => { await Promise.resolve() })
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(1)

    // No blind retry on any timer, however long the clock runs. The monitor arms a
    // fresh request only if reconciled state still has the bot on turn.
    await advanceAndFlush(RETRY_DELAY_MS * 5 + WATCHDOG_MS)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)
  })

  it('does not POST when a spectator calls triggerBotTurn from a turn-timeout fallback', async () => {
    // #1014: the pages' onTimeout fallback re-derives "is it a bot's turn" and calls
    // the exported trigger, which had no spectator guard. The route refuses a
    // non-participant with 401/403, the retry-then-toast path then shows "Bot move
    // failed" to someone who is only watching, and each rejected POST holds the
    // server's bot lock long enough to push the real player's trigger into a 409.
    mockFetchWithGuest.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    } as any)
    const gameEngine = makeBotEngine() as any

    const { result } = renderHook(() =>
      useBotTurn({
        game: botGame,
        gameEngine,
        code: 'ABCD12',
        isGameStarted: true,
        isSpectator: true,
      })
    )

    await act(async () => {
      await result.current.triggerBotTurn('bot-1', 'game-123')
    })

    // No request, so no retry cycle and no toast however long the clock runs.
    await advanceAndFlush(WATCHDOG_MS + RETRY_DELAY_MS * 3)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()
    expect(showToast.error).not.toHaveBeenCalled()
  })
})
