import { Move } from '@/lib/game-engine'
import {
  LudoGame,
  LudoGameData,
  LUDO_FINISH,
  LUDO_YARD,
  absoluteSquare,
  isSafeSquare,
} from '@/lib/games/ludo-game'
import { ludoTokenPoint, LUDO_TRACK_CELLS } from '@/lib/games/ludo-layout'

const P1 = 'p1'
const P2 = 'p2'
const P3 = 'p3'

const move = (playerId: string, type: string, data: Record<string, unknown> = {}): Move => ({
  playerId,
  type,
  data,
  timestamp: new Date(),
})

const dataOf = (game: LudoGame): LudoGameData => game.getState().data as LudoGameData

/**
 * The die is the server's: `rollDie` reads crypto.getRandomValues when there is
 * one and Math.random otherwise. Both are fed from the same queue here, so each
 * test says exactly which numbers come up.
 */
function queueRolls(...values: number[]) {
  const queue = [...values]
  const next = () => {
    const value = queue.shift()
    if (value === undefined) throw new Error('ludo test: ran out of queued rolls')
    return value
  }
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
  if (cryptoApi?.getRandomValues) {
    jest.spyOn(cryptoApi as { getRandomValues: (a: Uint32Array) => Uint32Array }, 'getRandomValues').mockImplementation((array: Uint32Array) => {
      array[0] = next() - 1
      return array
    })
  }
  jest.spyOn(Math, 'random').mockImplementation(() => (next() - 1) / 6 + 0.01)
  return queue
}

function newGame(players = [P1, P2], mode: 'quick' | 'classic' = 'quick'): LudoGame {
  const game = new LudoGame('ludo-test', { maxPlayers: 4, minPlayers: 2, rules: { mode } })
  for (const id of players) game.addPlayer({ id, name: id.toUpperCase() })
  expect(game.startGame()).toBe(true)
  return game
}

/** Put tokens where a test needs them, the way a restored state would carry them. */
function place(game: LudoGame, tokens: Record<string, number[]>) {
  const state = game.getState()
  const data = state.data as LudoGameData
  for (const [playerId, positions] of Object.entries(tokens)) data.tokens[playerId] = [...positions]
  game.restoreState(state)
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('LudoGame setup', () => {
  it('gives two tokens each in quick mode and four in classic', () => {
    expect(dataOf(newGame([P1, P2], 'quick')).tokens[P1]).toEqual([LUDO_YARD, LUDO_YARD])
    expect(dataOf(newGame([P1, P2], 'classic')).tokens[P1]).toEqual([LUDO_YARD, LUDO_YARD, LUDO_YARD, LUDO_YARD])
  })

  it('defaults to quick mode', () => {
    const game = new LudoGame('ludo-default')
    game.addPlayer({ id: P1, name: 'A' })
    game.addPlayer({ id: P2, name: 'B' })
    game.startGame()
    expect(game.getMode()).toBe('quick')
    expect(dataOf(game).tokensPerPlayer).toBe(2)
  })

  it('seats two players opposite each other and four all round', () => {
    expect(dataOf(newGame([P1, P2])).seats.map((s) => s.color)).toEqual(['red', 'yellow'])
    expect(dataOf(newGame([P1, P2, P3, 'p4'])).seats.map((s) => s.color)).toEqual(['red', 'green', 'yellow', 'blue'])
  })

  it('refuses to start with one player', () => {
    const game = new LudoGame('ludo-solo')
    game.addPlayer({ id: P1, name: 'A' })
    expect(game.startGame()).toBe(false)
  })
})

describe('LudoGame rolling and leaving the yard', () => {
  it('ignores a die value sent by the client', () => {
    const game = newGame()
    queueRolls(2)
    expect(game.makeMove(move(P1, 'roll', { value: 6 }))).toBe(true)
    expect(dataOf(game).lastRoll?.value).toBe(2)
  })

  it('only lets a token out of the yard on a 6, and passes the turn otherwise', () => {
    const game = newGame()
    queueRolls(5)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1]).toEqual([LUDO_YARD, LUDO_YARD])
    expect(game.getCurrentPlayer()?.id).toBe(P2)
    expect(dataOf(game).events.at(-1)?.kind).toBe('no-move')
  })

  it('brings a token out on a 6 and rolls again', () => {
    const game = newGame()
    queueRolls(6)
    game.makeMove(move(P1, 'roll'))
    // Two tokens in the yard: a choice, so the player picks.
    expect(game.getPhase()).toBe('move')
    expect(dataOf(game).legalTokens).toEqual([0, 1])
    expect(game.makeMove(move(P1, 'move', { token: 1 }))).toBe(true)
    expect(dataOf(game).tokens[P1]).toEqual([LUDO_YARD, 0])
    // The 6 earns another roll for the same seat.
    expect(game.getCurrentPlayer()?.id).toBe(P1)
    expect(game.getPhase()).toBe('roll')
  })

  it('moves automatically when only one move is legal', () => {
    const game = newGame()
    place(game, { [P1]: [10, LUDO_YARD] })
    queueRolls(3)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1]).toEqual([13, LUDO_YARD])
    expect(game.getCurrentPlayer()?.id).toBe(P2)
  })

  it('loses the turn on the third 6 in a row', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    queueRolls(6, 6, 6)
    game.makeMove(move(P1, 'roll'))
    game.makeMove(move(P1, 'move', { token: 0 }))
    game.makeMove(move(P1, 'roll'))
    game.makeMove(move(P1, 'move', { token: 0 }))
    expect(game.getCurrentPlayer()?.id).toBe(P1)
    const before = [...dataOf(game).tokens[P1]]
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1]).toEqual(before)
    expect(dataOf(game).events.at(-1)?.kind).toBe('triple-six')
    expect(game.getCurrentPlayer()?.id).toBe(P2)
    expect(dataOf(game).consecutiveSixes).toBe(0)
  })

  it('refuses a move out of turn, a move before rolling and a token that is not legal', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    expect(game.makeMove(move(P2, 'roll'))).toBe(false)
    expect(game.makeMove(move(P1, 'move', { token: 0 }))).toBe(false)
    queueRolls(4)
    game.makeMove(move(P1, 'roll'))
    expect(game.makeMove(move(P1, 'move', { token: 5 }))).toBe(false)
    expect(game.makeMove(move(P1, 'roll'))).toBe(false)
  })

  it('keeps a per-player roll history for the table to see', () => {
    const game = newGame()
    queueRolls(3, 4)
    game.makeMove(move(P1, 'roll'))
    game.makeMove(move(P2, 'roll'))
    expect(dataOf(game).rollHistory).toEqual({ [P1]: [3], [P2]: [4] })
  })
})

describe('LudoGame captures and safe squares', () => {
  it('sends an opponent home when landing on them', () => {
    const game = newGame()
    // Red at relative 10 = absolute 10. Yellow starts at 26, so yellow's
    // relative 38 is absolute (26 + 38) % 52 = 12.
    place(game, { [P1]: [10, LUDO_YARD], [P2]: [38, LUDO_YARD] })
    expect(absoluteSquare('yellow', 38)).toBe(12)
    queueRolls(2)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1][0]).toBe(12)
    expect(dataOf(game).tokens[P2]).toEqual([LUDO_YARD, LUDO_YARD])
    expect(dataOf(game).events.at(-1)?.kind).toBe('capture')
    expect(dataOf(game).lastMove?.captured).toEqual([{ playerId: P2, token: 0, from: 38 }])
  })

  it('cannot capture on a star square or a start square', () => {
    const game = newGame()
    // Absolute 8 is a star square; yellow's relative 34 lands there.
    expect(isSafeSquare(8)).toBe(true)
    place(game, { [P1]: [5, LUDO_YARD], [P2]: [34, LUDO_YARD] })
    queueRolls(3)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1][0]).toBe(8)
    expect(dataOf(game).tokens[P2][0]).toBe(34)
  })

  it('does not capture a token sitting on its own start square when another enters', () => {
    const game = newGame()
    // Yellow's token at its relative 26 sits on red's start square (absolute 0).
    expect(absoluteSquare('yellow', 26)).toBe(0)
    place(game, { [P1]: [LUDO_YARD, LUDO_FINISH], [P2]: [26, LUDO_YARD] })
    queueRolls(6)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1][0]).toBe(0)
    expect(dataOf(game).tokens[P2][0]).toBe(26)
  })

  it('never captures inside a home column', () => {
    const game = newGame()
    place(game, { [P1]: [49, LUDO_YARD], [P2]: [LUDO_YARD, LUDO_YARD] })
    queueRolls(4)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).tokens[P1][0]).toBe(53)
    expect(absoluteSquare('red', 53)).toBeNull()
  })
})

describe('LudoGame reaching home and winning', () => {
  it('needs the exact number to reach home', () => {
    const game = newGame()
    place(game, { [P1]: [54, LUDO_FINISH] })
    queueRolls(5)
    game.makeMove(move(P1, 'roll'))
    // 54 + 5 overshoots 56: no legal move, the turn passes.
    expect(dataOf(game).tokens[P1][0]).toBe(54)
    expect(game.getCurrentPlayer()?.id).toBe(P2)
  })

  it('wins when the last token reaches home exactly, and ranks the rest by progress', () => {
    const game = newGame([P1, P2, P3])
    place(game, {
      [P1]: [54, LUDO_FINISH],
      [P2]: [30, 12],
      [P3]: [LUDO_FINISH, 3],
    })
    queueRolls(2)
    game.makeMove(move(P1, 'roll'))
    const state = game.getState()
    expect(state.status).toBe('finished')
    expect(state.winner).toBe(P1)
    // P3 has a token home, P2 has none: tokens home rank before steps.
    expect(dataOf(game).ranking).toEqual([P1, P3, P2])
    const placements = game.getPlayers().map((p) => [p.id, (p as { placement?: number }).placement])
    expect(placements).toEqual([[P1, 1], [P2, 3], [P3, 2]])
    expect(game.getPlayers().find((p) => p.id === P1)?.score).toBe(2)
    expect(game.makeMove(move(P2, 'roll'))).toBe(false)
  })
})

describe('LudoGame review fixes (#1102)', () => {
  it('keeps the bonus roll after a 6 that has no legal move', () => {
    const game = newGame()
    // Both tokens home-bound: 54 + 6 and 55 + 6 overshoot, so the 6 cannot be played.
    place(game, { [P1]: [54, 55] })
    queueRolls(6)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).events.at(-1)?.kind).toBe('no-move')
    expect(game.getCurrentPlayer()?.id).toBe(P1)
    expect(dataOf(game).phase).toBe('roll')
    expect(dataOf(game).consecutiveSixes).toBe(1)
  })

  it('still loses the turn when the unplayable 6 is the third in a row', () => {
    const game = newGame()
    place(game, { [P1]: [54, 55] })
    queueRolls(6, 6, 6)
    game.makeMove(move(P1, 'roll'))
    game.makeMove(move(P1, 'roll'))
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).events.at(-1)?.kind).toBe('triple-six')
    expect(game.getCurrentPlayer()?.id).toBe(P2)
  })

  it('ranks a seat that left the game after every player who stayed', () => {
    const game = newGame([P1, P2, P3])
    place(game, {
      [P1]: [54, LUDO_FINISH],
      [P2]: [LUDO_FINISH, 40],
      [P3]: [3, LUDO_YARD],
    })
    // P2 left mid-game: the leave path marks the seat inactive on the raw state.
    const state = game.getState()
    state.players = state.players.map((p) => (p.id === P2 ? { ...p, isActive: false } : p))
    game.restoreState(state)
    queueRolls(2)
    game.makeMove(move(P1, 'roll'))
    expect(game.getState().status).toBe('finished')
    expect(dataOf(game).ranking).toEqual([P1, P3, P2])
  })

  it('runs one clock per turn: a roll that leaves a choice does not restart it', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    const state = game.getState()
    state.turnStartedAt = 1_000
    game.restoreState(state)
    queueRolls(3)
    game.makeMove(move(P1, 'roll'))
    expect(dataOf(game).phase).toBe('move')
    expect(game.getState().turnStartedAt).toBe(1_000)
  })

  it('gives a bonus roll after a 6 a fresh clock', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    const state = game.getState()
    state.turnStartedAt = 1_000
    game.restoreState(state)
    queueRolls(6)
    game.makeMove(move(P1, 'roll'))
    game.makeMove(move(P1, 'move', { token: 0 }))
    expect(game.getCurrentPlayer()?.id).toBe(P1)
    expect(game.getState().turnStartedAt).toBeGreaterThan(1_000)
  })

  it('only accepts timeout through the turn-timer path', () => {
    const game = newGame()
    expect(game.isTimerOnlyMove(move(P1, 'timeout'))).toBe(true)
    expect(game.isTimerOnlyMove(move(P1, 'roll'))).toBe(false)
  })

  it('brings a restored engine to a fresh roll when the seat on the clock changed outside it', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    queueRolls(3)
    game.makeMove(move(P1, 'roll'))
    const state = game.getState()
    state.currentPlayerIndex = 1
    const copy = new LudoGame('ludo-test')
    copy.restoreState(JSON.parse(JSON.stringify(state)))
    expect(copy.getData().phase).toBe('roll')
    expect(copy.getData().turnPlayerId).toBe(P2)
    expect(copy.getData().legalTokens).toEqual([])
  })
})

describe('LudoGame turn timer and stale turns', () => {
  it('lets the timeout roll, move and pass the turn without a bonus roll', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    queueRolls(6)
    expect(game.makeMove(move(P1, 'timeout'))).toBe(true)
    // Furthest-along token moved; a 6 does not keep an idle player on the clock.
    expect(dataOf(game).tokens[P1]).toEqual([10, 26])
    expect(game.getCurrentPlayer()?.id).toBe(P2)
    expect(dataOf(game).events.at(-1)?.auto).toBe(true)
  })

  it('lets the timeout finish a pending choice', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    queueRolls(3)
    game.makeMove(move(P1, 'roll'))
    expect(game.getPhase()).toBe('move')
    game.makeMove(move(P1, 'timeout'))
    expect(dataOf(game).tokens[P1]).toEqual([10, 23])
    expect(game.getCurrentPlayer()?.id).toBe(P2)
  })

  it('starts a seat that inherited the turn from outside the engine with a roll', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    queueRolls(3)
    game.makeMove(move(P1, 'roll'))
    // The leave path advances currentPlayerIndex on the raw state (#992).
    const state = game.getState()
    state.currentPlayerIndex = 1
    game.restoreState(state)
    expect(game.getPhase()).toBe('roll')
    queueRolls(4)
    expect(game.makeMove(move(P2, 'roll'))).toBe(true)
  })

  it('restores from a serialized state', () => {
    const game = newGame()
    place(game, { [P1]: [10, 20] })
    const copy = new LudoGame('ludo-test')
    copy.restoreState(JSON.parse(JSON.stringify(game.getState())))
    expect(copy.getTokens(P1)).toEqual([10, 20])
    expect(copy.getMode()).toBe('quick')
  })
})

describe('Ludo board layout', () => {
  it('has 52 distinct track squares', () => {
    expect(LUDO_TRACK_CELLS).toHaveLength(52)
    expect(new Set(LUDO_TRACK_CELLS.map(([r, c]) => `${r}:${c}`)).size).toBe(52)
  })

  it('puts every colour on its own start square and walks to its own home column', () => {
    expect(ludoTokenPoint('red', 0, 0)).toEqual({ x: 1.5, y: 6.5 })
    expect(ludoTokenPoint('green', 0, 0)).toEqual({ x: 8.5, y: 1.5 })
    expect(ludoTokenPoint('yellow', 0, 0)).toEqual({ x: 13.5, y: 8.5 })
    expect(ludoTokenPoint('blue', 0, 0)).toEqual({ x: 6.5, y: 13.5 })
    // The square before the home column is next to it.
    expect(ludoTokenPoint('red', 50, 0)).toEqual({ x: 0.5, y: 7.5 })
    expect(ludoTokenPoint('red', 51, 0)).toEqual({ x: 1.5, y: 7.5 })
  })
})
