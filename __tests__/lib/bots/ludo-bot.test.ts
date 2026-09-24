import { LudoBot } from '@/lib/bots/ludo/ludo-bot'
import { LudoBotExecutor } from '@/lib/bots/ludo/ludo-bot-executor'
import { createBot } from '@/lib/bots/core/bot-factory'
import { LudoGame, LudoGameData, LUDO_YARD } from '@/lib/games/ludo-game'
import type { BotDifficulty } from '@/lib/bots/core/bot-types'
import type { Move } from '@/lib/game-engine'

jest.mock('@/lib/bots/core/bot-ux-timing', () => ({
  ...jest.requireActual('@/lib/bots/core/bot-ux-timing'),
  botDelay: () => Promise.resolve(),
}))

const HUMAN = 'human'
const BOT = 'bot'

function botTurnGame(tokens: Record<string, number[]>): LudoGame {
  const game = new LudoGame('ludo-bot-test')
  game.addPlayer({ id: HUMAN, name: 'Human' })
  game.addPlayer({ id: BOT, name: 'Bot' })
  game.startGame()
  const state = game.getState()
  const data = state.data as LudoGameData
  for (const [playerId, positions] of Object.entries(tokens)) data.tokens[playerId] = [...positions]
  state.currentPlayerIndex = 1
  data.turnPlayerId = BOT
  game.restoreState(state)
  return game
}

/** Put the bot in the move phase with `dice`, as a roll with a choice would. */
function withDice(game: LudoGame, dice: number): LudoGame {
  const state = game.getState()
  const data = state.data as LudoGameData
  data.phase = 'move'
  data.dice = dice
  data.legalTokens = game.getMoveOptionsFor(BOT, dice).map((o) => o.token)
  game.restoreState(state)
  return game
}

afterEach(() => jest.restoreAllMocks())

describe('LudoBot', () => {
  it('is what the factory builds for ludo', () => {
    const game = botTurnGame({})
    expect(createBot('ludo', game, 'hard')).toBeInstanceOf(LudoBot)
  })

  it('rolls when the phase is roll, at every difficulty', async () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as BotDifficulty[]) {
      const bot = new LudoBot(botTurnGame({}), difficulty, BOT)
      expect(await bot.makeDecision()).toEqual({ type: 'roll' })
    }
  })

  it('only ever picks a legal token', async () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as BotDifficulty[]) {
      for (let dice = 1; dice <= 6; dice++) {
        const game = withDice(botTurnGame({ [BOT]: [LUDO_YARD, 5], [HUMAN]: [20, 40] }), dice)
        const legal = game.getData().legalTokens
        if (legal.length === 0) continue
        const decision = await new LudoBot(game, difficulty, BOT).makeDecision()
        expect(decision.type).toBe('move')
        if (decision.type === 'move') expect(legal).toContain(decision.token)
        const move = new LudoBot(game, difficulty, BOT).decisionToMove(decision)
        expect(game.validateMove(move)).toBe(true)
      }
    }
  })

  it('medium and hard take a capture over a plain move', async () => {
    // The bot is blue-less yellow (seat 2 of 2). Yellow relative 12 = absolute 38;
    // red relative 40 = absolute 40, two ahead of it.
    for (const difficulty of ['medium', 'hard'] as BotDifficulty[]) {
      const game = withDice(botTurnGame({ [BOT]: [12, 30], [HUMAN]: [40, LUDO_YARD] }), 2)
      const decision = await new LudoBot(game, difficulty, BOT).makeDecision()
      expect(decision).toEqual({ type: 'move', token: 0 })
    }
  })

  it('medium brings a token out on a 6 when nothing can be captured', async () => {
    const game = withDice(botTurnGame({ [BOT]: [LUDO_YARD, 30], [HUMAN]: [LUDO_YARD, LUDO_YARD] }), 6)
    expect(await new LudoBot(game, 'medium', BOT).makeDecision()).toEqual({ type: 'move', token: 0 })
  })

  it('hard steps out of reach instead of into it', async () => {
    // Yellow token 0 at relative 20 (absolute 46) has red at absolute 43 three
    // behind it. Token 1 at relative 2 (absolute 28) is in no danger. With a 1,
    // token 0 lands on absolute 47 - a star square - which is safe.
    const game = withDice(botTurnGame({ [BOT]: [20, 2], [HUMAN]: [43, LUDO_YARD] }), 1)
    expect(await new LudoBot(game, 'hard', BOT).makeDecision()).toEqual({ type: 'move', token: 0 })
  })
})

describe('LudoBotExecutor', () => {
  it('plays a whole turn through the engine and hands the turn back', async () => {
    const game = botTurnGame({ [BOT]: [5, 12] })
    const moves: Move[] = []
    await LudoBotExecutor.executeBotTurn(game, BOT, 'easy', async (move) => {
      moves.push(move)
      expect(game.makeMove(move)).toBe(true)
    })
    expect(moves[0].type).toBe('roll')
    expect(game.getCurrentPlayer()?.id).toBe(HUMAN)
  })

  it('stops as soon as the game ends', async () => {
    // Every roll is a 1, which is exactly what the last token needs.
    const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
    if (cryptoApi?.getRandomValues) {
      jest.spyOn(cryptoApi as { getRandomValues: (a: Uint32Array) => Uint32Array }, 'getRandomValues')
        .mockImplementation((array: Uint32Array) => { array[0] = 0; return array })
    }
    jest.spyOn(Math, 'random').mockReturnValue(0)

    const game = botTurnGame({ [BOT]: [55, 56] })
    let commits = 0
    await LudoBotExecutor.executeBotTurn(game, BOT, 'hard', async (move) => {
      commits += 1
      expect(game.makeMove(move)).toBe(true)
    })
    expect(game.getState().status).toBe('finished')
    expect(game.getState().winner).toBe(BOT)
    // One roll that moves the token home by itself, then nothing more.
    expect(commits).toBe(1)
  })
})
