import { Move } from '@/lib/game-engine'
import { ConnectFourGame, ConnectFourGameData, CellValue, PlayerDisc, ROWS, COLS } from '@/lib/games/connect-four-game'
import { BaseBot } from '../core/base-bot'
import { BotDifficulty } from '../core/bot-types'

export interface ConnectFourBotDecision {
  type: 'drop'
  col: number
}

/** Plies the hard bot looks ahead below its own move. */
const HARD_SEARCH_DEPTH = 6
/**
 * A connected four, above anything the window heuristic can add up to: at 100 a
 * position the heuristic rated highly could outrank a forced win.
 */
const WIN_SCORE = 1_000_000
/** Centre first: alpha-beta cuts far more when the strongest columns are tried first. */
const SEARCH_COLUMN_ORDER = Array.from({ length: COLS }, (_, i) => i).sort(
  (a, b) => Math.abs(a - Math.floor(COLS / 2)) - Math.abs(b - Math.floor(COLS / 2)),
)

/** Every line of four on the board, as cell coordinates; built once, not per evaluation. */
const WINDOWS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = (() => {
  const windows: (readonly [number, number])[][] = []
  const directions: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of directions) {
        const endR = r + dr * 3
        const endC = c + dc * 3
        if (endR < 0 || endR >= ROWS || endC < 0 || endC >= COLS) continue
        windows.push([0, 1, 2, 3].map((i) => [r + dr * i, c + dc * i] as const))
      }
    }
  }
  return windows
})()

function scoreWindow(discCount: number, oppCount: number): number {
  const emptyCount = 4 - discCount - oppCount
  if (oppCount > 0 && discCount > 0) return 0
  if (discCount === 4) return 100
  if (discCount === 3 && emptyCount === 1) return 5
  if (discCount === 2 && emptyCount === 2) return 2
  if (oppCount === 3 && emptyCount === 1) return -4
  if (oppCount === 2 && emptyCount === 2) return -1
  return 0
}

/** Wall-clock cap on the hard search; the bot plays the deepest result it finished. */
export const CONNECT_FOUR_HARD_TIME_BUDGET_MS = 250
/** How often, in visited nodes, the search looks at the clock. */
const CLOCK_CHECK_INTERVAL = 256

class SearchTimeout extends Error {}

export class ConnectFourBot extends BaseBot<ConnectFourGame, ConnectFourBotDecision> {
  private botUserId: string | null
  private readonly timeBudgetMs: number
  private deadline = 0
  private nodes = 0

  constructor(
    gameEngine: ConnectFourGame,
    difficulty: BotDifficulty = 'medium',
    botUserId?: string,
    options: { timeBudgetMs?: number } = {},
  ) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
    this.timeBudgetMs = options.timeBudgetMs ?? CONNECT_FOUR_HARD_TIME_BUDGET_MS
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

  /**
   * Iterative deepening to HARD_SEARCH_DEPTH, capped by wall clock: the column
   * played is the best of the deepest search that finished, so a crowded
   * mid-game position can never hold the bot's reply for seconds.
   */
  private pickHard(board: CellValue[][], disc: PlayerDisc): number {
    let ordered = this.orderedAvailableCols(board)
    let bestCol = ordered[0]
    this.deadline = Date.now() + this.timeBudgetMs
    this.nodes = 0

    for (let depth = 0; depth <= HARD_SEARCH_DEPTH; depth++) {
      try {
        const scored: { col: number; score: number }[] = []
        let bestScore = Number.NEGATIVE_INFINITY
        for (const col of ordered) {
          const next = this.dropDisc(board, col, disc)
          if (!next) continue
          const score = -this.negamax(next, disc === 1 ? 2 : 1, disc, depth, Number.NEGATIVE_INFINITY, -bestScore)
          scored.push({ col, score })
          if (score > bestScore) bestScore = score
        }
        // Stable sort keeps centre-first among equals.
        ordered = scored.sort((a, b) => b.score - a.score).map((entry) => entry.col)
        bestCol = ordered[0]
        if (Math.abs(bestScore) >= WIN_SCORE) break
      } catch (error) {
        if (error instanceof SearchTimeout) break
        throw error
      }
    }

    return bestCol
  }

  /** Negamax with alpha-beta. Returns score from the perspective of `currentDisc`. */
  private negamax(board: CellValue[][], currentDisc: PlayerDisc, botDisc: PlayerDisc, depth: number, alpha: number, beta: number): number {
    if (++this.nodes % CLOCK_CHECK_INTERVAL === 0 && Date.now() >= this.deadline) throw new SearchTimeout()
    const available = this.orderedAvailableCols(board)

    // Terminal: previous disc won → currentDisc lost → negative from currentDisc's perspective
    const prevDisc: PlayerDisc = currentDisc === 1 ? 2 : 1
    if (this.boardHasWinner(board, prevDisc)) {
      return -(WIN_SCORE + depth)
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

    for (const window of WINDOWS) {
      let discCount = 0
      let oppCount = 0
      for (const [r, c] of window) {
        const cell = board[r][c]
        if (cell === disc) discCount++
        else if (cell === opponent) oppCount++
      }
      score += scoreWindow(discCount, oppCount)
    }

    return score
  }

  private boardHasWinner(board: CellValue[][], disc: PlayerDisc): boolean {
    return WINDOWS.some((window) => window.every(([r, c]) => board[r][c] === disc))
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

  private orderedAvailableCols(board: CellValue[][]): number[] {
    return SEARCH_COLUMN_ORDER.filter((c) => board[0][c] === null)
  }

  private getAvailableCols(board: CellValue[][]): number[] {
    const cols: number[] = []
    for (let c = 0; c < COLS; c++) {
      if (board[0][c] === null) cols.push(c)
    }
    return cols
  }
}
