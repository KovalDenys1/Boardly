import { Move } from '@/lib/game-engine'
import {
  CheckersCell,
  CheckersGame,
  CheckersGameData,
  Side,
  generateTurns,
} from '@/lib/games/checkers-game'
import { CHECKERS_HARD_TIME_BUDGET_MS, CheckersBot, evaluateCheckersBoard } from '@/lib/bots/checkers/checkers-bot'
import { CheckersBotExecutor } from '@/lib/bots/checkers/checkers-bot-executor'
import type { BotDifficulty } from '@/lib/bots/core/bot-types'

jest.mock('@/lib/bots/core/bot-ux-timing', () => ({
  botDelay: () => Promise.resolve(),
}))

const HUMAN = 'human'
const BOT = 'bot'

const makeGame = (): CheckersGame => {
  const g = new CheckersGame('ck-bot-test')
  g.addPlayer({ id: HUMAN, name: 'Human' })
  g.addPlayer({ id: BOT, name: 'Bot' })
  g.startGame()
  return g
}

const getData = (g: CheckersGame): CheckersGameData => g.getState().data as CheckersGameData

const setPosition = (g: CheckersGame, pieces: Array<[number, number, CheckersCell]>, side: Side) => {
  const board: CheckersCell[][] = Array.from({ length: 8 }, () => Array<CheckersCell>(8).fill(0))
  for (const [r, c, v] of pieces) board[r][c] = v
  const state = g.getState()
  g.restoreState({
    ...state,
    currentPlayerIndex: side - 1,
    data: { ...(state.data as CheckersGameData), board, currentSide: side },
  })
}

/** Drive the executor the way the bot-turn route does: every hop through makeMove. */
const playBotTurn = async (g: CheckersGame, difficulty: BotDifficulty, botId = BOT) => {
  await CheckersBotExecutor.executeBotTurn(g, botId, difficulty, async (move: Move) => {
    if (!g.makeMove(move)) throw new Error(`Bot move rejected: ${JSON.stringify(move.data)}`)
  })
}

/**
 * The bot itself with a short search budget, hop by hop through makeMove. The
 * executor always gives hard its full budget, which is right for a real turn
 * and far too slow for a test that plays hundreds of them.
 */
const playFastTurn = async (g: CheckersGame, difficulty: BotDifficulty, actor: string, timeBudgetMs = 15) => {
  const bot = new CheckersBot(g, difficulty, actor, { timeBudgetMs })
  const decision = await bot.makeDecision()
  decision.steps.forEach((_, index) => {
    const move = bot.decisionToMove(decision, index)
    if (!g.makeMove(move)) throw new Error(`Bot move rejected: ${JSON.stringify(move.data)}`)
  })
}

describe('CheckersBot', () => {
  it.each<[BotDifficulty, number]>([['easy', 150], ['medium', 150], ['hard', 60]])('%s plays only legal turns against itself', async (difficulty, plies) => {
    const g = makeGame()
    for (let ply = 0; ply < plies && g.getState().status === 'playing'; ply++) {
      const actor = g.getCurrentPlayer()?.id as string
      const sideBefore = getData(g).currentSide
      if (difficulty === 'hard') await playFastTurn(g, difficulty, actor)
      else await playBotTurn(g, difficulty, actor)
      if (g.getState().status === 'playing') {
        // The turn always ends with the chain finished and the other side to move.
        expect(getData(g).chainFrom).toBeNull()
        expect(getData(g).currentSide).not.toBe(sideBefore)
      }
    }
  }, 30_000)

  it('medium takes the double jump over the single one', async () => {
    const g = makeGame()
    // Side 2 (the bot) at (0,1) can double-jump (1,2) and (3,4); at (0,5) it can single-jump (1,6).
    setPosition(g, [[0, 1, 2], [1, 2, 1], [3, 4, 1], [0, 5, 2], [1, 6, 1], [7, 0, 1]], 2)
    const bot = new CheckersBot(g, 'medium', BOT)
    const decision = await bot.makeDecision()
    expect(decision.steps).toHaveLength(2)
    expect(decision.steps[0].from).toEqual([0, 1])
  })

  it('medium does not walk into a capture when a safe move exists', async () => {
    const g = makeGame()
    // Bot man at (2,3). Moving to (3,4) walks next to the human man at (4,5),
    // which then jumps it into the empty (2,3); (3,2) is safe.
    setPosition(g, [[2, 3, 2], [4, 5, 1], [7, 0, 1]], 2)
    for (let i = 0; i < 10; i++) {
      const decision = await new CheckersBot(g, 'medium', BOT).makeDecision()
      expect(decision.steps[0].to).toEqual([3, 2])
    }
  })

  it('hard finds the capture that wins the game', async () => {
    const g = makeGame()
    setPosition(g, [[3, 2, 4], [4, 3, 1], [5, 6, 2]], 2)
    const decision = await new CheckersBot(g, 'hard', BOT).makeDecision()
    expect(decision.steps[0]).toEqual({ from: [3, 2], to: [5, 4], capture: [4, 3] })
  })

  it('hard beats easy', async () => {
    let hardWins = 0
    for (let game = 0; game < 4; game++) {
      const g = makeGame()
      for (let ply = 0; ply < 300 && g.getState().status === 'playing'; ply++) {
        const actor = g.getCurrentPlayer()?.id as string
        await playFastTurn(g, actor === BOT ? 'hard' : 'easy', actor)
      }
      if (g.getState().winner === BOT) hardWins++
    }
    expect(hardWins).toBeGreaterThanOrEqual(3)
  }, 60_000)

  it('hard deepens until its budget is spent, and never past about a second', async () => {
    const g = makeGame()
    g.makeMove({ playerId: HUMAN, type: 'step', data: { from: [5, 2], to: [4, 3] }, timestamp: new Date() })
    const started = Date.now()
    const decision = await new CheckersBot(g, 'hard', BOT).makeDecision()
    const elapsed = Date.now() - started
    expect(CHECKERS_HARD_TIME_BUDGET_MS).toBeLessThanOrEqual(900)
    expect(elapsed).toBeLessThan(1100)
    const legal = generateTurns(getData(g).board, 2).map((t) => JSON.stringify(t.steps))
    expect(legal).toContain(JSON.stringify(decision.steps))
  })

  it('cannot be given a budget above the cap', async () => {
    const g = makeGame()
    const started = Date.now()
    await new CheckersBot(g, 'hard', HUMAN, { timeBudgetMs: 60_000 }).makeDecision()
    expect(Date.now() - started).toBeLessThan(1100)
  })

  it('plays a legal move when the clock runs out inside the first real depth', async () => {
    const g = makeGame()
    const decision = await new CheckersBot(g, 'hard', HUMAN, { timeBudgetMs: 1 }).makeDecision()
    const legal = generateTurns(getData(g).board, 1).map((t) => JSON.stringify(t.steps))
    expect(legal).toContain(JSON.stringify(decision.steps))
  })

  it('hard draws among equally good moves instead of always playing the first', async () => {
    const g = makeGame()
    // A lone man on the back row with two equal first steps, and nothing near it.
    setPosition(g, [[0, 3, 2], [7, 0, 1]], 2)
    const pick = async (random: number) => {
      const spy = jest.spyOn(Math, 'random').mockReturnValue(random)
      try {
        return (await new CheckersBot(g, 'hard', BOT, { timeBudgetMs: 60 }).makeDecision()).steps[0].to
      } finally {
        spy.mockRestore()
      }
    }
    const low = await pick(0)
    const high = await pick(0.9999)
    expect([low, high]).toEqual(expect.arrayContaining([[1, 2], [1, 4]]))
  })

  it.each<BotDifficulty>(['medium', 'hard'])('%s finishes a chain along the branch that takes the most', async (difficulty) => {
    const g = makeGame()
    // Mid-chain at (2,3): over (3,2) to (4,1) goes on over (5,2) to (6,3); over
    // (3,4) to (4,5) stops there. Random used to take either.
    const state = g.getState()
    const board: CheckersCell[][] = Array.from({ length: 8 }, () => Array<CheckersCell>(8).fill(0))
    for (const [r, c, v] of [[2, 3, 2], [3, 2, 1], [5, 2, 1], [3, 4, 1], [7, 6, 1]] as const) board[r][c] = v
    g.restoreState({
      ...state,
      currentPlayerIndex: 1,
      data: { ...(state.data as CheckersGameData), board, currentSide: 2, chainFrom: [2, 3], pendingCaptures: [] },
    })
    for (let i = 0; i < 8; i++) {
      const decision = await new CheckersBot(g, difficulty, BOT, { timeBudgetMs: 30 }).makeDecision()
      expect(decision.steps.map((s) => s.to)).toEqual([[4, 1], [6, 3]])
    }
  })

  it('finishes a chain it finds itself in the middle of', async () => {
    const g = makeGame()
    setPosition(g, [[0, 1, 2], [1, 2, 1], [3, 4, 1], [7, 0, 1]], 2)
    g.makeMove({ playerId: BOT, type: 'step', data: { from: [0, 1], to: [2, 3] }, timestamp: new Date() })
    expect(getData(g).chainFrom).toEqual([2, 3])
    await playBotTurn(g, 'easy')
    expect(getData(g).chainFrom).toBeNull()
    expect(getData(g).board[4][5]).toBe(2)
  })

  it('scores material, kings and advancement from the side asked about', () => {
    const board: CheckersCell[][] = Array.from({ length: 8 }, () => Array<CheckersCell>(8).fill(0))
    board[7][0] = 1
    board[0][1] = 2
    expect(evaluateCheckersBoard(board, 1)).toBe(0)
    board[4][3] = 3
    expect(evaluateCheckersBoard(board, 1)).toBeGreaterThan(150)
    expect(evaluateCheckersBoard(board, 2)).toBeLessThan(-150)
  })
})
