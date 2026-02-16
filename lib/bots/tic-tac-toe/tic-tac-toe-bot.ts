import { Move } from '@/lib/game-engine'
import {
  CellValue,
  PlayerSymbol,
  TicTacToeGame,
  TicTacToeGameData,
} from '@/lib/games/tic-tac-toe-game'
import { BaseBot } from '../core/base-bot'
import { BotDifficulty } from '../core/bot-types'

export interface TicTacToeBotDecision {
  type: 'place'
  row: number
  col: number
}

interface CellPosition {
  row: number
  col: number
}

type Winner = PlayerSymbol | 'draw' | null

export class TicTacToeBot extends BaseBot<TicTacToeGame, TicTacToeBotDecision> {
  private botUserId: string | null

  constructor(
    gameEngine: TicTacToeGame,
    difficulty: BotDifficulty = 'medium',
    botUserId?: string,
  ) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
  }

  setBotUserId(botUserId: string) {
    this.botUserId = botUserId
  }

  async makeDecision(): Promise<TicTacToeBotDecision> {
    const gameData = this.gameEngine.getState().data as TicTacToeGameData
    const board = this.cloneBoard(gameData.board)
    const botSymbol = gameData.currentSymbol
    const opponentSymbol: PlayerSymbol = botSymbol === 'X' ? 'O' : 'X'
    const emptyCells = this.getEmptyCells(board)

    if (emptyCells.length === 0) {
      throw new Error('No available moves for Tic-Tac-Toe bot')
    }

    let selectedMove: CellPosition
    if (this.config.difficulty === 'easy') {
      selectedMove = this.pickRandomMove(emptyCells)
    } else if (this.config.difficulty === 'hard') {
      selectedMove = this.pickHardMove(board, botSymbol, opponentSymbol)
    } else {
      selectedMove = this.pickMediumMove(board, botSymbol, opponentSymbol)
    }

    return {
      type: 'place',
      row: selectedMove.row,
      col: selectedMove.col,
    }
  }

  decisionToMove(decision: TicTacToeBotDecision): Move {
    const playerId = this.botUserId || this.gameEngine.getCurrentPlayer()?.id
    if (!playerId) {
      throw new Error('Unable to resolve bot player id for Tic-Tac-Toe move')
    }

    return {
      playerId,
      type: 'place',
      data: {
        row: decision.row,
        col: decision.col,
      },
      timestamp: new Date(),
    }
  }

  evaluateState(): string {
    const state = this.gameEngine.getState()
    const gameData = state.data as TicTacToeGameData
    return `TicTacToe turn=${state.currentPlayerIndex} symbol=${gameData.currentSymbol} moves=${gameData.moveCount}`
  }

  private pickMediumMove(
    board: CellValue[][],
    botSymbol: PlayerSymbol,
    opponentSymbol: PlayerSymbol,
  ): CellPosition {
    const winningMove = this.findWinningMove(board, botSymbol)
    if (winningMove) return winningMove

    const blockingMove = this.findWinningMove(board, opponentSymbol)
    if (blockingMove) return blockingMove

    if (board[1][1] === null) {
      return { row: 1, col: 1 }
    }

    const corners = this.getCornerMoves(board)
    if (corners.length > 0) {
      return this.pickRandomMove(corners)
    }

    return this.pickRandomMove(this.getEmptyCells(board))
  }

  private pickHardMove(
    board: CellValue[][],
    botSymbol: PlayerSymbol,
    opponentSymbol: PlayerSymbol,
  ): CellPosition {
    const emptyCells = this.getEmptyCells(board)
    let bestScore = Number.NEGATIVE_INFINITY
    let bestMoves: CellPosition[] = []

    for (const cell of emptyCells) {
      const simulatedBoard = this.cloneBoard(board)
      simulatedBoard[cell.row][cell.col] = botSymbol

      const score = this.minimax(
        simulatedBoard,
        false,
        botSymbol,
        opponentSymbol,
        1,
      )

      if (score > bestScore) {
        bestScore = score
        bestMoves = [cell]
      } else if (score === bestScore) {
        bestMoves.push(cell)
      }
    }

    if (bestMoves.length === 0) {
      return this.pickRandomMove(emptyCells)
    }

    return bestMoves
      .slice()
      .sort((a, b) => this.getPositionPriority(b) - this.getPositionPriority(a))[0]
  }

  private minimax(
    board: CellValue[][],
    isMaximizing: boolean,
    botSymbol: PlayerSymbol,
    opponentSymbol: PlayerSymbol,
    depth: number,
  ): number {
    const winner = this.evaluateWinner(board)
    if (winner === botSymbol) return 10 - depth
    if (winner === opponentSymbol) return depth - 10
    if (winner === 'draw') return 0

    const symbolToPlay: PlayerSymbol = isMaximizing ? botSymbol : opponentSymbol
    const emptyCells = this.getEmptyCells(board)

    if (isMaximizing) {
      let bestScore = Number.NEGATIVE_INFINITY
      for (const cell of emptyCells) {
        const nextBoard = this.cloneBoard(board)
        nextBoard[cell.row][cell.col] = symbolToPlay
        const score = this.minimax(nextBoard, false, botSymbol, opponentSymbol, depth + 1)
        bestScore = Math.max(bestScore, score)
      }
      return bestScore
    }

    let bestScore = Number.POSITIVE_INFINITY
    for (const cell of emptyCells) {
      const nextBoard = this.cloneBoard(board)
      nextBoard[cell.row][cell.col] = symbolToPlay
      const score = this.minimax(nextBoard, true, botSymbol, opponentSymbol, depth + 1)
      bestScore = Math.min(bestScore, score)
    }
    return bestScore
  }

  private findWinningMove(board: CellValue[][], symbol: PlayerSymbol): CellPosition | null {
    const emptyCells = this.getEmptyCells(board)

    for (const cell of emptyCells) {
      const nextBoard = this.cloneBoard(board)
      nextBoard[cell.row][cell.col] = symbol
      if (this.evaluateWinner(nextBoard) === symbol) {
        return cell
      }
    }

    return null
  }

  private evaluateWinner(board: CellValue[][]): Winner {
    const lines: Array<[CellPosition, CellPosition, CellPosition]> = [
      [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
      [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
      [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
      [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
      [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
      [{ row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }],
      [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
      [{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }],
    ]

    for (const [a, b, c] of lines) {
      const first = board[a.row][a.col]
      if (first !== null && first === board[b.row][b.col] && first === board[c.row][c.col]) {
        return first
      }
    }

    const hasEmpty = board.some((row) => row.some((cell) => cell === null))
    return hasEmpty ? null : 'draw'
  }

  private getEmptyCells(board: CellValue[][]): CellPosition[] {
    const emptyCells: CellPosition[] = []
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        if (board[row][col] === null) {
          emptyCells.push({ row, col })
        }
      }
    }
    return emptyCells
  }

  private getCornerMoves(board: CellValue[][]): CellPosition[] {
    const candidates: CellPosition[] = [
      { row: 0, col: 0 },
      { row: 0, col: 2 },
      { row: 2, col: 0 },
      { row: 2, col: 2 },
    ]

    return candidates.filter((cell) => board[cell.row][cell.col] === null)
  }

  private pickRandomMove(moves: CellPosition[]): CellPosition {
    return moves[Math.floor(Math.random() * moves.length)]
  }

  private getPositionPriority(cell: CellPosition): number {
    if (cell.row === 1 && cell.col === 1) return 3 // center
    if ((cell.row === 0 || cell.row === 2) && (cell.col === 0 || cell.col === 2)) return 2 // corners
    return 1 // edges
  }

  private cloneBoard(board: CellValue[][]): CellValue[][] {
    return board.map((row) => [...row])
  }
}
