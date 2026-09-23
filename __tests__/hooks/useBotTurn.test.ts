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

import {
  BOT_COMMIT_DELIVERY_ALLOWANCE_MS,
  resolveBotInTurnPauseMs,
  resolveBotTurnGraceMs,
} from '@/lib/bots/core/bot-turn-pace'

const WATCHDOG_MS = 14_000
const RETRY_DELAY_MS = 2_000
// The grace is no longer one number: it is the longest the game's own bot can go
// without writing anything, plus an allowance for the write reaching this client.
// Imported rather than written out, because the number it has to agree with is
// the executors' - `__tests__/lib/bots/bot-turn-pace.test.ts` runs them and fails
// if this module's table has drifted from what they actually pause for.
const TTT_GRACE_MS = resolveBotTurnGraceMs('tic_tac_toe')
// A caller that can reconcile gets asked what the turn is before anything is
// written, so its request goes out one delivery allowance after the grace.
const TTT_WRITE_MS = TTT_GRACE_MS + BOT_COMMIT_DELIVERY_ALLOWANCE_MS + 10

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
        gameType: 'tic_tac_toe',
        reconcileWithServerSnapshot,
      })
    )

    // Nothing goes out while the server's own trigger has the turn (#1049).
    await advanceAndFlush(0)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()

    // The grace expires into a reconcile, not a write: nothing having reached
    // this tab is not the same as the bot being stuck.
    await advanceAndFlush(TTT_GRACE_MS)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(1)

    await advanceAndFlush(BOT_COMMIT_DELIVERY_ALLOWANCE_MS + 10)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)

    // Advance past watchdog threshold
    await advanceAndFlush(WATCHDOG_MS + 100)
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(2)

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
        gameType: 'tic_tac_toe',
        reconcileWithServerSnapshot,
      })
    )

    await advanceAndFlush(TTT_WRITE_MS)
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
        gameType: 'tic_tac_toe',
        reconcileWithServerSnapshot,
      })
    )

    await advanceAndFlush(TTT_WRITE_MS)
    await act(async () => { await Promise.resolve() })

    // Once for the grace expiring, once for the successful turn (#859).
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(2)
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
        gameType: 'tic_tac_toe',
        reconcileWithServerSnapshot,
      })
    )

    // The first attempt plus MAX_BOT_RETRIES (2) retries, each on its own delay.
    await advanceAndFlush(TTT_WRITE_MS)
    await act(async () => { await Promise.resolve() })
    await advanceAndFlush(RETRY_DELAY_MS + 100)
    await act(async () => { await Promise.resolve() })
    await advanceAndFlush(RETRY_DELAY_MS + 100)
    await act(async () => { await Promise.resolve() })

    expect(mockFetchWithGuest).toHaveBeenCalledTimes(3)
    expect(showToast.error).toHaveBeenCalledWith('toast.botMoveFailed')
    // Once for the grace expiring, once after the last retry failed.
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(2)
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
        gameType: 'tic_tac_toe',
        reconcileWithServerSnapshot,
      })
    )

    await advanceAndFlush(TTT_WRITE_MS)
    await act(async () => { await Promise.resolve() })

    // Only the one the grace expiry asked for - the 400 itself adds none.
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(1)
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
          gameType: 'tic_tac_toe',
        }),
      { initialProps: { engine: gameEngine } }
    )

    await advanceAndFlush(TTT_GRACE_MS - 200)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()

    // The server-side trigger's bot move lands and the turn goes back to the human.
    rerender({ engine: makeHumanTurnEngine() as any })
    await advanceAndFlush(TTT_GRACE_MS * 3)

    expect(mockFetchWithGuest).not.toHaveBeenCalled()
  })

  it('sits through a Memory bot\'s whole mismatch pause without firing (#1049)', async () => {
    // The case a hardcoded 2500 ms grace did not cover, and the reason the number
    // is derived now. A Memory bot commits its second flip, waits out
    // botDelay(difficulty, 1200) so a human can read the two cards, then
    // botDelay(difficulty, 180) inside resolveMismatch, and only then commits the
    // move that ends the turn - 2311 ms at the default Easy difficulty, against
    // which 2500 ms left 189 ms for a Prisma write and a Supabase delivery. The
    // client's deferred POST landed inside a bot turn that was running correctly
    // and took the 409 this ticket is about.
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => ({}) } as any)
    const mismatchPauseMs = resolveBotInTurnPauseMs('memory', 'easy')
    const writeAndDeliveryMs = 200

    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: botGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
          gameType: 'memory',
        }),
      { initialProps: { engine: makeBotEngine('bot-1', 1, 1_000) as any } }
    )

    // The second flip is the last thing this client hears from the bot until the
    // resolve move: nothing broadcasts during a botDelay.
    await advanceAndFlush(mismatchPauseMs + writeAndDeliveryMs)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()

    // The resolve move lands and the turn goes back to the human.
    rerender({ engine: makeHumanTurnEngine(1_000 + mismatchPauseMs) as any })
    await advanceAndFlush(resolveBotTurnGraceMs('memory') * 3)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()
  })

  it('writes nothing when the turn had already moved and the broadcast was just late (#1049)', async () => {
    // Measured live on 2026-09-20, Yahtzee against an Easy bot on localhost: the
    // bot took the turn at t=13.5s, its bot-action events ran through to "scores
    // 17 in Chance" at t=16.3s, and no game-update for that final commit reached
    // the tab before the grace expired at t=17.3s. The POST that went out then
    // came back 400 {"error":"Not bot's turn"} - a wasted write with the pacing
    // already correct, which is the other half of what this ticket counts.
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => ({}) } as any)
    let engine: unknown = makeBotEngine('bot-1', 1, 1_000)
    const reconcileWithServerSnapshot = jest.fn(async () => {
      // What the server says: the bot finished and the turn is the human's.
      engine = makeHumanTurnEngine(9_000)
      rerender({ engine: engine as any })
    })

    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: botGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
          gameType: 'tic_tac_toe',
          reconcileWithServerSnapshot,
        }),
      { initialProps: { engine: engine as any } }
    )

    await advanceAndFlush(TTT_GRACE_MS)
    await act(async () => { await Promise.resolve() })
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(1)

    // The fresh state cancels the armed write, so the run costs one read and no
    // failed write at all.
    await advanceAndFlush(BOT_COMMIT_DELIVERY_ALLOWANCE_MS + WATCHDOG_MS)
    expect(mockFetchWithGuest).not.toHaveBeenCalled()
  })

  it('re-arms on every commit, so a multi-commit turn never runs the timer down', async () => {
    // Memory's other branch: the bot finds a pair and goes round for another one,
    // so the seat does not change but lastMoveAt does. Each commit has to restart
    // the wait, or a turn of five pairs would eventually outlast one grace.
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => ({}) } as any)
    const graceMs = resolveBotTurnGraceMs('memory')
    const stepMs = graceMs - 100

    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: botGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
          gameType: 'memory',
        }),
      { initialProps: { engine: makeBotEngine('bot-1', 1, 1_000) as any } }
    )

    for (let commit = 1; commit <= 4; commit++) {
      await advanceAndFlush(stepMs)
      rerender({ engine: makeBotEngine('bot-1', 1, 1_000 + commit * stepMs) as any })
    }
    await advanceAndFlush(stepMs)

    expect(mockFetchWithGuest).not.toHaveBeenCalled()
    // Total elapsed is well past one grace: it is the re-arming that held it off.
    expect(stepMs * 5).toBeGreaterThan(graceMs * 4)
  })

  it('waits longer for Memory than for tic-tac-toe, because their bots pause differently', async () => {
    // A single number cannot be right for both: a tic-tac-toe turn is one commit
    // after one short pause, a Memory turn is several commits with a long pause in
    // the middle. The hook takes the game type and asks the bots' own timing module.
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => ({}) } as any)

    renderHook(() =>
      useBotTurn({
        game: botGame,
        gameEngine: makeBotEngine() as any,
        code: 'ABCD12',
        isGameStarted: true,
        gameType: 'tic_tac_toe',
      })
    )

    await advanceAndFlush(resolveBotTurnGraceMs('tic_tac_toe'))
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)
    // The same elapsed time inside a Memory game would still be inside the bot's
    // own mismatch pause.
    expect(resolveBotTurnGraceMs('memory')).toBeGreaterThan(
      resolveBotInTurnPauseMs('memory', 'easy')
    )
    expect(resolveBotTurnGraceMs('tic_tac_toe')).toBeLessThan(
      resolveBotInTurnPauseMs('memory', 'easy')
    )
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

    const reconcileWithServerSnapshot = jest.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: threeSeatGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
          gameType: 'tic_tac_toe',
          reconcileWithServerSnapshot,
        }),
      { initialProps: { engine: makeBotEngine('bot-1', 1, 1000) as any } }
    )

    await advanceAndFlush(TTT_WRITE_MS)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)

    // And it goes out at once, without the read the grace path takes first:
    // there is no server-side driver on this hop for a read to find.
    rerender({ engine: makeBotEngine('bot-2', 2, 2000) as any })
    await advanceAndFlush(10)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(2)
    expect(mockFetchWithGuest.mock.calls[1][1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ botUserId: 'bot-2', lobbyCode: 'ABCD12' }) })
    )
  })

  it('waits for the previous bot request instead of dropping the next bot (#1084)', async () => {
    // The previous bot's last commit is broadcast before its request answers, so
    // the next bot shows up while that request is still open. Firing then used to
    // be dropped as "already in progress" with the signature still armed, and the
    // next bot sat until the turn timer's fallback.
    let resolveFirst: (value: unknown) => void = () => {}
    mockFetchWithGuest
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }) as any)
      .mockResolvedValue({ ok: true, json: async () => ({}) } as any)
    const threeSeatGame = {
      id: 'game-123',
      players: [
        { userId: 'player-1', user: { bot: null } },
        { userId: 'bot-1', user: { bot: { id: 'bot-1' } } },
        { userId: 'bot-2', user: { bot: { id: 'bot-2' } } },
      ],
    }

    const reconcileWithServerSnapshot = jest.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ engine }) =>
        useBotTurn({
          game: threeSeatGame,
          gameEngine: engine,
          code: 'ABCD12',
          isGameStarted: true,
          gameType: 'tic_tac_toe',
          reconcileWithServerSnapshot,
        }),
      { initialProps: { engine: makeBotEngine('bot-1', 1, 1000) as any } }
    )

    await advanceAndFlush(TTT_WRITE_MS)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)

    // bot-2's turn arrives while bot-1's request is still open.
    rerender({ engine: makeBotEngine('bot-2', 2, 2000) as any })
    await advanceAndFlush(10)
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst({ ok: true, json: async () => ({}) })
      await Promise.resolve()
    })
    await advanceAndFlush(300)
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
        gameType: 'tic_tac_toe',
        reconcileWithServerSnapshot,
      })
    )

    await advanceAndFlush(TTT_WRITE_MS)
    await act(async () => { await Promise.resolve() })
    expect(mockFetchWithGuest).toHaveBeenCalledTimes(1)
    // One for the grace expiring, one for the 409.
    expect(reconcileWithServerSnapshot).toHaveBeenCalledTimes(2)

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
        gameType: 'tic_tac_toe',
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
