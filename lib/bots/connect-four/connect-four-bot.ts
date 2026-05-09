import { Move } from '@/lib/game-engine'
import { ConnectFourGame, ConnectFourGameData, CellValue, PlayerDisc, ROWS, COLS } from '@/lib/games/connect-four-game'
import { BaseBot } from '../core/base-bot'
import { BotDifficulty } from '../core/bot-types'

export interface ConnectFourBotDecision {
  type: 'drop'
  col: number
}

export class ConnectFourBot extends BaseBot<ConnectFourGame, ConnectFourBotDecision> {
  private botUserId: string | null

  constructor(gameEngine: ConnectFourGame, difficulty: BotDifficulty = 'medium', botUserId?: string) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
  }

  setBotUserId(botUserId: string) {
    this.botUserId = botUserId
  }

  async makeDecision(): Promise<ConnectFourBotDecision> {
    const gameData = this.gameEngine.getState().data as ConnectFourGameData
    const available = this.gameEngine.getAvailableColumns()

    if (available.length === 0) throw new Error('No available columns for Connect Four bot')

    let col: number
    if (this.config.difficulty === 'easy') {
      col = this.pickRandom(available)
    } else if (this.config.difficulty === 'hard') {
      col = this.pickHard(gameData.board, gameData.currentDisc)
    } else {
      col = this.pickMedium(gameData.board, gameData.currentDisc)
    }

    return { type: 'drop', col }
  }

  decisionToMove(decision: ConnectFourBotDecision): Move {
    const playerId = this.botUserId || this.gameEngine.getCurrentPlayer()?.id
    if (!playerId) throw new Error('Unable to resolve bot player id for Connect Four move')
    return { playerId, type: 'drop', data: { col: decision.col }, timestamp: new Date() }
  }

  evaluateState(): string {
    const state = this.gameEngine.getState()
    const gameData = state.data as ConnectFourGameData
    return `ConnectFour turn=${state.currentPlayerIndex} disc=${gameData.currentDisc} moves=${gameData.moveCount}`
  }

  private pickRandom(cols: number[]): number {
    return cols[Math.floor(Math.random() * cols.length)]
  }

  private pickMedium(board: CellValue[][], disc: PlayerDisc): number {
    const opponent: PlayerDisc = disc === 1 ? 2 : 1
    const available = this.getAvailableCols(board)

    // Win immediately
    const win = this.findWinningCol(board, disc, available)
    if (win !== null) return win

    // Block opponent win
    const block = this.findWinningCol(board, opponent, available)
    if (block !== null) return block

    // Prefer center columns
    return this.pickByScore(board, disc, available, false)
  }

  private pickHard(board: CellValue[][], disc: PlayerDisc): number {
    const available = this.getAvailableCols(board)
    let bestCol = available[Math.floor(available.length / 2)]
    let bestScore = Number.NEGATIVE_INFINITY

    for (const col of available) {
      const next = this.dropDisc(board, col, disc)
      if (!next) continue
      const score = this.negamax(next, disc === 1 ? 2 : 1, disc, 6, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
      if (-score > bestScore) {
        bestScore = -score
        bestCol = col
      }
    }

    return bestCol
  }

  /** Negamax with alpha-beta. Returns score from the perspective of `currentDisc`. */
  private negamax(board: CellValue[][], currentDisc: PlayerDisc, botDisc: PlayerDisc, depth: number, alpha: number, beta: number): number {
    const available = this.getAvailableCols(board)

    // Terminal: previous disc won → currentDisc lost → negative from currentDisc's perspective
    const prevDisc: PlayerDisc = currentDisc === 1 ? 2 : 1
    if (this.boardHasWinner(board, prevDisc)) {
      return -(100 + depth)
    }

    if (available.length === 0 || depth === 0) {
      return this.evaluateBoard(board, currentDisc)
    }

    let best = Number.NEGATIVE_INFINITY
    for (const col of available) {
      const next = this.dropDisc(board, col, currentDisc)
      if (!next) continue
      const score = -this.negamax(next, currentDisc === 1 ? 2 : 1, botDisc, depth - 1, -beta, -alpha)
      best = Math.max(best, score)
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }

    return best
  }

  private evaluateBoard(board: CellValue[][], disc: PlayerDisc): number {
    const opponent: PlayerDisc = disc === 1 ? 2 : 1
    let score = 0

    // Center column preference
    const centerCol = Math.floor(COLS / 2)
    for (let r = 0; r < ROWS; r++) {
      if (board[r][centerCol] === disc) score += 3
      if (board[r][centerCol] === opponent) score -= 3
    }

    // Score all windows of 4
    const windows = this.getAllWindows(board)
    for (const window of windows) {
      score += this.scoreWindow(window, disc)
    }

    return score
  }

  private scoreWindow(window: (CellValue)[], disc: PlayerDisc): number {
    const opponent: PlayerDisc = disc === 1 ? 2 : 1
    const discCount = window.filter((c) => c === disc).length
    const emptyCount = window.filter((c) => c === null).length
    const oppCount = window.filter((c) => c === opponent).length

    if (oppCount > 0 && discCount > 0) return 0
    if (discCount === 4) return 100
    if (discCount === 3 && emptyCount === 1) return 5
    if (discCount === 2 && emptyCount === 2) return 2
    if (oppCount === 3 && emptyCount === 1) return -4
    if (oppCount === 2 && emptyCount === 2) return -1
    return 0
  }

  private getAllWindows(board: CellValue[][]): CellValue[][] {
    const windows: CellValue[][] = []

    // Horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        windows.push([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]])
      }
    }

    // Vertical
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r <= ROWS - 4; r++) {
        windows.push([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]])
      }
    }

    // Diagonal ↘
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        windows.push([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]])
      }
    }

    // Diagonal ↙
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 3; c < COLS; c++) {
        windows.push([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]])
      }
    }

    return windows
  }

  private boardHasWinner(board: CellValue[][], disc: PlayerDisc): boolean {
    // Check all 4-windows for a winner
    const windows = this.getAllWindows(board)
    return windows.some((w) => w.every((c) => c === disc))
  }

  private pickByScore(board: CellValue[][], disc: PlayerDisc, available: number[], _hard: boolean): number {
    // Prefer center, then adjacent to center
    const centerCol = Math.floor(COLS / 2)
    const order = [centerCol, centerCol - 1, centerCol + 1, centerCol - 2, centerCol + 2, 0, COLS - 1]
    for (const col of order) {
      if (available.includes(col)) return col
    }
    return this.pickRandom(available)
  }

  private findWinningCol(board: CellValue[][], disc: PlayerDisc, available: number[]): number | null {
    for (const col of available) {
      const next = this.dropDisc(board, col, disc)
      if (next && this.boardHasWinner(next, disc)) return col
    }
    return null
  }

  private dropDisc(board: CellValue[][], col: number, disc: PlayerDisc): CellValue[][] | null {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][col] === null) {
        const next = board.map((row) => [...row])
        next[r][col] = disc
        return next
      }
    }
    return null
  }

  private getAvailableCols(board: CellValue[][]): number[] {
    const cols: number[] = []
    for (let c = 0; c < COLS; c++) {
      if (board[0][c] === null) cols.push(c)
    }
    return cols
  }
}
