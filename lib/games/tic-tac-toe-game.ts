import { GameEngine, Player, Move, GameConfig } from '../game-engine'

export type CellValue = 'X' | 'O' | null
export type PlayerSymbol = 'X' | 'O'

export interface TicTacToeGameData {
  board: CellValue[][]
  currentSymbol: PlayerSymbol
  winner: PlayerSymbol | 'draw' | null
  winningLine: [number, number][] | null
  moveCount: number
}

export class TicTacToeGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 2, minPlayers: 2 }) {
    super(gameId, 'ticTacToe', config)
  }

  getInitialGameData(): TicTacToeGameData {
    return {
      board: [
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ],
      currentSymbol: 'X',
      winner: null,
      winningLine: null,
      moveCount: 0,
    }
  }

  validateMove(move: Move): boolean {
    const gameData = this.state.data as TicTacToeGameData

    if (move.type !== 'place') {
      return false
    }

    if (this.state.status !== 'playing') {
      return false
    }

    if (gameData.winner !== null) {
      return false
    }

    const playerIndex = this.state.players.findIndex((player) => player.id === move.playerId)
    if (playerIndex === -1 || playerIndex !== this.state.currentPlayerIndex) {
      return false
    }

    const { row, col } = move.data as { row?: unknown; col?: unknown }
    if (
      typeof row !== 'number' ||
      typeof col !== 'number' ||
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row > 2 ||
      col < 0 ||
      col > 2
    ) {
      return false
    }

    if (gameData.board[row][col] !== null) {
      return false
    }

    return true
  }

  processMove(move: Move): void {
    const gameData = this.state.data as TicTacToeGameData
    const { row, col } = move.data as { row: number; col: number }
    const currentSymbol = gameData.currentSymbol

    gameData.board[row][col] = currentSymbol
    gameData.moveCount += 1

    const winningLine = this.checkForWinner(gameData.board)
    if (winningLine) {
      gameData.winner = currentSymbol
      gameData.winningLine = winningLine
      this.state.status = 'finished'
      return
    }

    if (gameData.moveCount === 9) {
      gameData.winner = 'draw'
      gameData.winningLine = null
      this.state.status = 'finished'
      return
    }

    gameData.currentSymbol = currentSymbol === 'X' ? 'O' : 'X'
  }

  checkWinCondition(): Player | null {
    const gameData = this.state.data as TicTacToeGameData

    if (gameData.winner === null || gameData.winner === 'draw') {
      return null
    }

    const winnerIndex = gameData.winner === 'X' ? 0 : 1
    return this.state.players[winnerIndex] || null
  }

  getGameRules(): string[] {
    return [
      'Two players take turns (X and O)',
      'Mark any empty cell on the 3×3 grid',
      'First to get 3 in a row wins (horizontal, vertical, or diagonal)',
      'If all 9 cells are filled with no winner, the game is a draw',
    ]
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    return this.state.status === 'playing'
  }

  private checkForWinner(board: CellValue[][]): [number, number][] | null {
    for (let row = 0; row < 3; row += 1) {
      if (board[row][0] !== null && board[row][0] === board[row][1] && board[row][1] === board[row][2]) {
        return [[row, 0], [row, 1], [row, 2]]
      }
    }

    for (let col = 0; col < 3; col += 1) {
      if (board[0][col] !== null && board[0][col] === board[1][col] && board[1][col] === board[2][col]) {
        return [[0, col], [1, col], [2, col]]
      }
    }

    if (board[0][0] !== null && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
      return [[0, 0], [1, 1], [2, 2]]
    }

    if (board[0][2] !== null && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
      return [[0, 2], [1, 1], [2, 0]]
    }

    return null
  }
}
