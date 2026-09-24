/**
 * #1049. The client's bot-turn recovery grace has to outlast the longest stretch
 * a bot turn can go without writing anything, because that stretch is the window
 * in which a client that fires anyway collects a 409 for a turn being played
 * correctly. `BOT_LONGEST_IN_TURN_PAUSE_BASES` is the table the grace is computed
 * from, and this file is what stops it being a table of guesses: it runs the real
 * executors, records the `botDelay` calls each one makes between two `onMove`
 * commits, and fails if the longest run it measures is not the declared one.
 *
 * Add a pause to an executor, or lengthen one, and this test fails with the run
 * it saw - which is the signal to update the table, and with it the grace.
 */
import type { Move } from '@/lib/game-engine'
import type { BotDifficulty } from '@/lib/bots/core/bot-types'

const recordedDelayBases: number[] = []

jest.mock('@/lib/bots/core/bot-ux-timing', () => {
  const actual = jest.requireActual('@/lib/bots/core/bot-ux-timing')
  return {
    ...actual,
    botDelay: (_difficulty: BotDifficulty, baseMs: number) => {
      recordedDelayBases.push(baseMs)
      return Promise.resolve()
    },
  }
})

import { MemoryBotExecutor } from '@/lib/bots/memory/memory-bot-executor'
import { YahtzeeBotExecutor } from '@/lib/bots/yahtzee/yahtzee-bot-executor'
import { TicTacToeBotExecutor } from '@/lib/bots/tic-tac-toe/tic-tac-toe-bot-executor'
import { ConnectFourBotExecutor } from '@/lib/bots/connect-four/connect-four-bot-executor'
import { RockPaperScissorsBotExecutor } from '@/lib/bots/rock-paper-scissors/rock-paper-scissors-bot-executor'
import { CheckersBotExecutor } from '@/lib/bots/checkers/checkers-bot-executor'
import { CHECKERS_HARD_TIME_BUDGET_MS } from '@/lib/bots/checkers/checkers-bot'
import { MemoryGame, type MemoryGameData } from '@/lib/games/memory-game'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { ConnectFourGame } from '@/lib/games/connect-four-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { CheckersGame, type CheckersCell, type CheckersGameData } from '@/lib/games/checkers-game'
import {
  BOT_COMMIT_DELIVERY_ALLOWANCE_MS,
  BOT_LONGEST_IN_TURN_PAUSE_BASES,
  BOT_SEARCH_BUDGET_MS,
  resolveBotInTurnPauseMs,
  resolveBotTurnGraceMs,
  type BotPacedGameType,
} from '@/lib/bots/core/bot-turn-pace'
import { resolveBotUxDelayMs } from '@/lib/bots/core/bot-ux-timing'

const HUMAN = { id: 'human-1', name: 'Human' }
const BOT = { id: 'bot-1', name: 'Botty' }

/**
 * Deterministic Math.random, so a board deal and a dice roll are the same on
 * every run. Boards are dealt randomly, and a test whose coverage depends on
 * which cards came up is a test that reports a different answer each morning.
 */
function seedRandom(seed: number) {
  let state = seed >>> 0
  jest.spyOn(Math, 'random').mockImplementation(() => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })
}

/**
 * Runs one bot turn and returns every run of consecutive `botDelay` base values
 * that sat between two commits (or before the first commit), in order.
 */
async function pauseRunsOfOneTurn(
  game: { makeMove: (move: Move) => boolean },
  run: (onMove: (move: Move) => Promise<void>) => Promise<void>,
): Promise<number[][]> {
  recordedDelayBases.length = 0
  const runs: number[][] = []
  await run(async (move: Move) => {
    runs.push([...recordedDelayBases])
    recordedDelayBases.length = 0
    // The executors are driven by the engine they are moving, exactly as the
    // bot-turn route drives them - a recorder that swallowed the move would
    // leave the bot flipping the same two cards until its safety cap.
    if (!game.makeMove(move)) {
      throw new Error(`Move rejected by the engine: ${JSON.stringify(move)}`)
    }
  })
  runs.push([...recordedDelayBases])
  return runs
}

function longestRun(runs: number[][], difficulty: BotDifficulty): number[] {
  const durationOf = (bases: number[]) =>
    bases.reduce((total, base) => total + resolveBotUxDelayMs(difficulty, base), 0)
  return runs.reduce((slowest, candidate) =>
    durationOf(candidate) > durationOf(slowest) ? candidate : slowest
  , [])
}

function startedOnBotTurn<T extends { addPlayer: (p: { id: string; name: string }) => unknown; startGame: () => unknown; getState: () => { currentPlayerIndex: number }; restoreState: (s: never) => unknown }>(game: T): T {
  game.addPlayer({ ...HUMAN })
  game.addPlayer({ ...BOT })
  game.startGame()
  const state = game.getState()
  state.currentPlayerIndex = 1
  game.restoreState(state as never)
  return game
}

function memoryGame(): MemoryGame {
  const game = new MemoryGame('memory-pace-test')
  game.addPlayer({ ...HUMAN })
  game.addPlayer({ ...BOT })
  game.startGame()
  const state = game.getState()
  state.currentPlayerIndex = 1
  game.restoreState(state)
  return game
}

describe('bot in-turn pause table matches the executors (#1049)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('memory: the mismatch pause plus the resolve pause is the longest silence', async () => {
    seedRandom(20260920)
    // A single turn only runs one of the bot's branches, so take the longest run
    // over several fresh boards - and prove below that both branches were seen.
    const allRuns: number[][] = []
    for (let turn = 0; turn < 12; turn++) {
      const game = memoryGame()
      allRuns.push(
        ...(await pauseRunsOfOneTurn(game, (onMove) =>
          MemoryBotExecutor.executeBotTurn(game, BOT.id, 'easy', onMove)
        ))
      )
    }

    // Both branches of the turn loop really ran: the mismatch one that ends the
    // turn, and the match one that goes round for another pair.
    expect(allRuns).toContainEqual([1200, 180])
    expect(allRuns).toContainEqual([420, 260])

    expect(longestRun(allRuns, 'easy')).toEqual([...BOT_LONGEST_IN_TURN_PAUSE_BASES.memory])
  })

  it('yahtzee: the tail of a roll plus the score that ends the turn is the longest silence', async () => {
    seedRandom(775533)
    const allRuns: number[][] = []
    for (let turn = 0; turn < 6; turn++) {
      const game = new YahtzeeGame('yahtzee-pace-test')
      game.addPlayer({ ...HUMAN })
      game.addPlayer({ ...BOT })
      game.startGame()
      const state = game.getState()
      state.currentPlayerIndex = 1
      game.restoreState(state)
      allRuns.push(
        ...(await pauseRunsOfOneTurn(game, (onMove) =>
          YahtzeeBotExecutor.executeBotTurn(game, BOT.id, 'easy', onMove)
        ))
      )
    }

    expect(longestRun(allRuns, 'easy')).toEqual([...BOT_LONGEST_IN_TURN_PAUSE_BASES.yahtzee])
  })

  it.each([
    [
      'tic_tac_toe' as const,
      () => startedOnBotTurn(new TicTacToeGame('ttt-pace-test')),
      TicTacToeBotExecutor.executeBotTurn.bind(TicTacToeBotExecutor),
    ],
    [
      'connect_four' as const,
      () => startedOnBotTurn(new ConnectFourGame('c4-pace-test')),
      ConnectFourBotExecutor.executeBotTurn.bind(ConnectFourBotExecutor),
    ],
    [
      'rock_paper_scissors' as const,
      () => startedOnBotTurn(new RockPaperScissorsGame('rps-pace-test')),
      RockPaperScissorsBotExecutor.executeBotTurn.bind(RockPaperScissorsBotExecutor),
    ],
  ])('%s: one pause, one commit', async (gameType, build, execute) => {
    seedRandom(4242)
    const game = build()
    const runs = await pauseRunsOfOneTurn(game, (onMove) =>
      (execute as (g: unknown, id: string, d: BotDifficulty, m: typeof onMove) => Promise<void>)(
        game, BOT.id, 'easy', onMove
      )
    )
    expect(longestRun(runs, 'easy')).toEqual([...BOT_LONGEST_IN_TURN_PAUSE_BASES[gameType]])
  })
})

describe('checkers commits a capture chain one hop at a time (#1083)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('pauses before every hop, and the hop pause is the longest silence', async () => {
    seedRandom(1083)
    const game = new CheckersGame('checkers-pace-test')
    game.addPlayer({ ...HUMAN })
    game.addPlayer({ ...BOT })
    game.startGame()
    // The bot (side 2, moving down) has a double jump: (0,1) over (1,2) and (3,4).
    const board: CheckersCell[][] = Array.from({ length: 8 }, () => Array<CheckersCell>(8).fill(0))
    board[0][1] = 2
    board[1][2] = 1
    board[3][4] = 1
    board[7][0] = 1
    const state = game.getState()
    game.restoreState({
      ...state,
      currentPlayerIndex: 1,
      data: { ...(state.data as CheckersGameData), board, currentSide: 2 },
    } as never)

    const runs = await pauseRunsOfOneTurn(game, (onMove) =>
      CheckersBotExecutor.executeBotTurn(game, BOT.id, 'easy', onMove)
    )

    expect(runs).toEqual([[150], [250], []])
    expect(longestRun(runs, 'easy')).toEqual([...BOT_LONGEST_IN_TURN_PAUSE_BASES.checkers])
  })

  it('counts the hard search, which is silence no botDelay records', () => {
    // The hard bot deepens for its whole budget before the first hop commits.
    expect(BOT_SEARCH_BUDGET_MS.checkers).toBe(CHECKERS_HARD_TIME_BUDGET_MS)
    expect(resolveBotTurnGraceMs('checkers')).toBeGreaterThan(
      CHECKERS_HARD_TIME_BUDGET_MS + resolveBotUxDelayMs('hard', 150) + BOT_COMMIT_DELIVERY_ALLOWANCE_MS - 1
    )
  })
})

describe('the grace covers the pause it is derived from (#1049)', () => {
  const gameTypes = Object.keys(BOT_LONGEST_IN_TURN_PAUSE_BASES) as BotPacedGameType[]
  const difficulties: BotDifficulty[] = ['easy', 'medium', 'hard']
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.BOT_UX_DELAY_MS
    delete process.env.BOT_UX_DELAY_SCALE
    delete process.env.BOT_UX_DELAY_MIN_MS
    delete process.env.BOT_UX_DELAY_MAX_MS
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('memory at the default difficulty is the case the hardcoded 2500 ms missed', () => {
    // The numbers the review ran: 2311 ms of bot pause against a 2500 ms grace
    // left 189 ms for a database write and a realtime delivery, so the client's
    // deferred POST landed inside the bot's own turn and took the 409 #1049 is
    // about. These two lines are why the constant was the wrong shape.
    expect(resolveBotInTurnPauseMs('memory', 'easy')).toBe(2311)
    expect(resolveBotTurnGraceMs('memory')).toBeGreaterThan(2_500)
  })

  it.each(gameTypes)('%s: grace beats the pause at every difficulty', (gameType) => {
    for (const difficulty of difficulties) {
      const pauseMs = resolveBotInTurnPauseMs(gameType, difficulty)
      expect(resolveBotTurnGraceMs(gameType)).toBeGreaterThanOrEqual(
        pauseMs + BOT_COMMIT_DELIVERY_ALLOWANCE_MS
      )
    }
  })

  it.each([
    ['BOT_UX_DELAY_SCALE', '2'],
    ['BOT_UX_DELAY_MAX_MS', '3000'],
    ['BOT_UX_DELAY_MS', '9000'],
    ['BOT_UX_DELAY_MIN_MS', '5000'],
  ])('%s cannot push a bot past the grace the client computes without it', (name, value) => {
    // The grace is computed in the browser, where these server-only variables
    // read as undefined. Before #1049 they were free to outrun it: scale 2 with
    // BOT_UX_DELAY_MAX_MS=3000 put Memory's in-turn pause at 3174 ms against a
    // 2500 ms grace - a guaranteed 409 on every Memory mismatch turn.
    const graceWithoutEnv = Object.fromEntries(
      gameTypes.map((gameType) => [gameType, resolveBotTurnGraceMs(gameType)])
    ) as Record<BotPacedGameType, number>

    process.env[name] = value

    for (const gameType of gameTypes) {
      for (const difficulty of difficulties) {
        expect(resolveBotInTurnPauseMs(gameType, difficulty)).toBeLessThan(
          graceWithoutEnv[gameType]
        )
      }
    }
  })
})
