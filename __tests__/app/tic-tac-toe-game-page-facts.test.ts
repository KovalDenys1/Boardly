import { getCatalogGames } from '@/lib/game-catalog'
import { BOT_DIFFICULTIES, getBotDisplayName } from '@/lib/bot-profiles'
import { TicTacToeGame, isTicTacToeMatchComplete, type TicTacToeGameData } from '@/lib/games/tic-tac-toe-game'
import en from '@/locales/en'

/**
 * #1235, the #973 pattern: /games/tic-tac-toe states numbers and rules, and each
 * one is recomputed here from the catalog, the bot profiles and the engine, so a
 * change there fails this file instead of leaving the page describing a game that
 * no longer exists.
 */

/** Every English string under a locale node, flattened. */
function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return Object.values(node as Record<string, unknown>).flatMap(strings)
}

const ttt = en.games.tictactoe
const copy = [...strings(ttt.detail), ...strings(ttt.seo)]
const config = getCatalogGames().find((game) => game.gameType === 'tic_tac_toe')!.lobbyCreateConfig!
const NUMBER_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 6: 'six' }

function play(engine: TicTacToeGame, playerId: string, row: number, col: number) {
  expect(engine.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })).toBe(true)
}

function startedGame() {
  const engine = new TicTacToeGame('game-1')
  engine.addPlayer({ id: 'x', name: 'X', score: 0, isActive: true })
  engine.addPlayer({ id: 'o', name: 'O', score: 0, isActive: true })
  engine.startGame()
  return engine
}

describe('the Tic Tac Toe series against the create form and the engine (#1235)', () => {
  const { desc } = ttt.detail.modes.seriesLength

  it('offers exactly the best-of lengths the form does, and an open-ended default', () => {
    for (const rounds of config.rounds!.options) expect(desc).toMatch(new RegExp(`best of ${rounds}\\b`))
    // `default: null` is the ∞ chip: the match is never complete on its own.
    expect(config.rounds!.default).toBeNull()
    expect(isTicTacToeMatchComplete({ targetRounds: null, roundsPlayed: 50, winsBySymbol: { X: 40, O: 0 }, draws: 10 })).toBe(false)
  })

  it('quotes the early-stop win count the engine uses for each length', () => {
    for (const rounds of config.rounds!.options) {
      const needed = Math.floor(rounds / 2) + 1
      const at = (wins: number) => isTicTacToeMatchComplete({ targetRounds: rounds, roundsPlayed: wins, winsBySymbol: { X: wins, O: 0 }, draws: 0 })
      expect(at(needed)).toBe(true)
      expect(at(needed - 1)).toBe(false)
      expect(desc).toMatch(new RegExp(`${NUMBER_WORDS[needed]} in a best of ${rounds}\\b`))
    }
  })

  it('can end level, as the copy says, because draws use up rounds', () => {
    expect(isTicTacToeMatchComplete({ targetRounds: 3, roundsPlayed: 3, winsBySymbol: { X: 1, O: 1 }, draws: 1 })).toBe(true)
    expect(desc).toMatch(/finish level/)
  })

  it('never says an open lobby plays a single round, on the page or in the catalog meta', () => {
    const seo = getCatalogGames().find((game) => game.gameType === 'tic_tac_toe')!.seo!
    const meta = [seo.title, seo.description, seo.schemaDescription]
    for (const text of [...copy, ...meta]) expect(text).not.toMatch(/single round|one round/i)
  })
})

describe('the Tic Tac Toe bots against lib/bot-profiles.ts (#1235)', () => {
  it('names each level the way the lobby does', () => {
    const { desc } = ttt.detail.modes.botLevels
    for (const difficulty of BOT_DIFFICULTIES) expect(desc).toContain(getBotDisplayName('tic_tac_toe', difficulty))
  })
})

describe('the Tic Tac Toe rules against the engine (#1235)', () => {
  it('lets X open the first round and O the second', () => {
    const engine = startedGame()
    expect((engine.getState().data as TicTacToeGameData).currentSymbol).toBe('X')
    play(engine, 'x', 0, 0)
    play(engine, 'o', 1, 0)
    play(engine, 'x', 0, 1)
    play(engine, 'o', 1, 1)
    play(engine, 'x', 0, 2)
    expect(engine.getState().status).toBe('finished')

    expect(engine.makeMove({ playerId: 'x', type: 'next-round', data: {}, timestamp: new Date() })).toBe(true)
    expect((engine.getState().data as TicTacToeGameData).currentSymbol).toBe('O')
    expect(engine.getState().currentPlayerIndex).toBe(1)
    expect(ttt.detail.rules.xOpensFirstRound).toMatch(/O starts round two/)
  })

  it('hands the round to the opponent on a timeout rather than skipping the move', () => {
    const engine = startedGame()
    expect(engine.makeMove({ playerId: 'x', type: 'timeout-forfeit', data: {}, timestamp: new Date() })).toBe(true)
    expect((engine.getState().data as TicTacToeGameData).winner).toBe('O')
    expect((engine.getState().data as TicTacToeGameData).match.winsBySymbol.O).toBe(1)
  })

  it('refuses a draw offer before the first mark, as the copy says', () => {
    const engine = startedGame()
    expect(engine.makeMove({ playerId: 'x', type: 'request-draw', data: {}, timestamp: new Date() })).toBe(false)
    play(engine, 'x', 1, 1)
    expect(engine.makeMove({ playerId: 'x', type: 'request-draw', data: {}, timestamp: new Date() })).toBe(true)
    expect(ttt.detail.rules.offersNeedConsent).toMatch(/once the first mark is down/)
  })
})
