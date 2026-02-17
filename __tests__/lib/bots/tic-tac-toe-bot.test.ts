import { CellValue, TicTacToeGame, TicTacToeGameData } from '@/lib/games/tic-tac-toe-game'
import { TicTacToeBot } from '@/lib/bots/tic-tac-toe/tic-tac-toe-bot'

function createGame(): TicTacToeGame {
  const game = new TicTacToeGame('ttt-bot-test')
  game.addPlayer({ id: 'human', name: 'Human' })
  game.addPlayer({ id: 'bot', name: 'AI Bot' })
  game.startGame()
  return game
}

function setBoardState(
  game: TicTacToeGame,
  board: CellValue[][],
  currentSymbol: 'X' | 'O',
  currentPlayerIndex: number,
) {
  const baseState = game.getState()
  const moveCount = board.flat().filter((cell) => cell !== null).length

  const nextState = {
    ...baseState,
    currentPlayerIndex,
    data: {
      ...(baseState.data as TicTacToeGameData),
      board: board.map((row) => [...row]),
      currentSymbol,
      winner: null,
      winningLine: null,
      moveCount,
    },
  }

  game.restoreState(nextState)
}

describe('TicTacToeBot', () => {
  it('medium difficulty takes immediate winning move', async () => {
    const game = createGame()
    setBoardState(
      game,
      [
        ['X', 'X', null],
        ['O', 'O', null],
        [null, null, null],
      ],
      'O',
      1,
    )

    const bot = new TicTacToeBot(game, 'medium', 'bot')
    const decision = await bot.makeDecision()

    expect(decision.type).toBe('place')
    expect(decision.row).toBe(1)
    expect(decision.col).toBe(2)
  })

  it('medium difficulty blocks opponent win when needed', async () => {
    const game = createGame()
    setBoardState(
      game,
      [
        ['X', 'X', null],
        ['O', null, null],
        [null, 'O', null],
      ],
      'O',
      1,
    )

    const bot = new TicTacToeBot(game, 'medium', 'bot')
    const decision = await bot.makeDecision()

    expect(decision.row).toBe(0)
    expect(decision.col).toBe(2)
  })

  it('hard difficulty finds optimal winning move', async () => {
    const game = createGame()
    setBoardState(
      game,
      [
        ['X', 'X', 'O'],
        ['X', 'O', null],
        [null, null, null],
      ],
      'O',
      1,
    )

    const bot = new TicTacToeBot(game, 'hard', 'bot')
    const decision = await bot.makeDecision()

    expect(decision.row).toBe(2)
    expect(decision.col).toBe(0)
  })

  it('hard difficulty prefers fork-creating pressure move in balanced positions', async () => {
    const game = createGame()
    setBoardState(
      game,
      [
        ['X', null, null],
        [null, 'O', null],
        [null, null, 'X'],
      ],
      'O',
      1,
    )

    const bot = new TicTacToeBot(game, 'hard', 'bot')
    const decision = await bot.makeDecision()

    expect(decision.row).toBe(0)
    expect(decision.col).toBe(1)
  })

  it('converts decision to move using configured bot user id', () => {
    const game = createGame()
    const bot = new TicTacToeBot(game, 'medium', 'bot')

    const move = bot.decisionToMove({
      type: 'place',
      row: 2,
      col: 1,
    })

    expect(move.playerId).toBe('bot')
    expect(move.type).toBe('place')
    expect(move.data).toEqual({ row: 2, col: 1 })
  })
})
