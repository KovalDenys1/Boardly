import { GameEngine, Player, Move, GameConfig } from '../game-engine'

export type CellValue = 1 | 2 | null // 1 = player 1 (red), 2 = player 2 (yellow)
export type PlayerDisc = 1 | 2

export const ROWS = 6
export const COLS = 7

export interface ConnectFourMoveRecord {
  disc: PlayerDisc
  col: number
  row: number
  timestamp: number
}

export interface ConnectFourUndoSnapshot {
  board: CellValue[][]
  currentDisc: PlayerDisc
  winner: PlayerDisc | 'draw' | null
  winningLine: [number, number][] | null
  moveCount: number
  currentPlayerIndex: number
  status: 'playing' | 'finished'
  lastDroppedRow: number | null
  lastDroppedCol: number | null
}

export interface ConnectFourPendingRequest {
  type: 'undo'
  requesterId: string
  responderId: string
  requestedAt: number
}

export interface ConnectFourGameData {
  board: CellValue[][]
  currentDisc: PlayerDisc
  winner: PlayerDisc | 'draw' | null
  winningLine: [number, number][] | null
  moveCount: number
  lastDroppedRow: number | null
  lastDroppedCol: number | null
  undoSnapshots: ConnectFourUndoSnapshot[]
  pendingRequest: ConnectFourPendingRequest | null
  moveHistory: ConnectFourMoveRecord[]
}

export class ConnectFourGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 2, minPlayers: 2 }) {
    super(gameId, 'connectFour', config)
  }

  getInitialGameData(): ConnectFourGameData {
    return {
      board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      currentDisc: 1,
      winner: null,
      winningLine: null,
      moveCount: 0,
      lastDroppedRow: null,
      lastDroppedCol: null,
      undoSnapshots: [],
      pendingRequest: null,
      moveHistory: [],
    }
  }

  protected normalizeRestoredData(): void {
    const data = this.state.data as ConnectFourGameData
    data.undoSnapshots = Array.isArray(data.undoSnapshots) ? data.undoSnapshots : []
    data.moveHistory = Array.isArray(data.moveHistory) ? data.moveHistory : []
    data.pendingRequest = data.pendingRequest?.type === 'undo' ? data.pendingRequest : null
  }

  validateMove(move: Move): boolean {
    const gameData = this.state.data as ConnectFourGameData

    if (move.type === 'next-round') {
      if (this.state.status !== 'finished') return false
      if (gameData.pendingRequest) return false
      const playerIndex = this.state.players.findIndex((p) => p.id === move.playerId)
      return playerIndex !== -1
    }

    if (move.type === 'request-undo') {
      if (this.state.status !== 'playing' && this.state.status !== 'finished') return false
      if (gameData.pendingRequest || (gameData.undoSnapshots?.length ?? 0) === 0) return false
      const playerIndex = this.state.players.findIndex((p) => p.id === move.playerId)
      if (playerIndex === -1) return false
      return this.resolveResponderId(move.playerId) !== null
    }

    if (move.type === 'respond-undo') {
      if (gameData.pendingRequest?.type !== 'undo' || gameData.pendingRequest.responderId !== move.playerId) return false
      return typeof move.data.accept === 'boolean'
    }

    if (move.type === 'timeout-forfeit') {
      const playerIndex = this.state.players.findIndex((p) => p.id === move.playerId)
      if (playerIndex === -1 || playerIndex !== this.state.currentPlayerIndex) return false
      if (this.state.status !== 'playing' || gameData.winner !== null || gameData.pendingRequest) return false
      return true
    }

    if (move.type !== 'drop') return false
    if (this.state.status !== 'playing') return false
    if (gameData.pendingRequest) return false
    if (gameData.winner !== null) return false

    const playerIndex = this.state.players.findIndex((p) => p.id === move.playerId)
    if (playerIndex === -1 || playerIndex !== this.state.currentPlayerIndex) return false

    const { col } = move.data as { col?: unknown }
    if (typeof col !== 'number' || !Number.isInteger(col) || col < 0 || col >= COLS) return false

    // Column must have at least one empty cell (top row)
    return gameData.board[0][col] === null
  }

  processMove(move: Move): void {
    const gameData = this.state.data as ConnectFourGameData

    if (move.type === 'next-round') {
      gameData.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
      gameData.currentDisc = 1
      gameData.winner = null
      gameData.winningLine = null
      gameData.moveCount = 0
      gameData.lastDroppedRow = null
      gameData.lastDroppedCol = null
      gameData.undoSnapshots = []
      gameData.pendingRequest = null
      gameData.moveHistory = []
      this.state.currentPlayerIndex = 0
      this.state.status = 'playing'
      this.state.winner = undefined
      this.state.lastMoveAt = Date.now()
      return
    }

    if (move.type === 'request-undo') {
      const responderId = this.resolveResponderId(move.playerId)
      if (!responderId) return
      gameData.pendingRequest = {
        type: 'undo',
        requesterId: move.playerId,
        responderId,
        requestedAt: move.timestamp.getTime(),
      }
      return
    }

    if (move.type === 'respond-undo') {
      if (move.data.accept === true) {
        this.undoLastMove(gameData)
        gameData.moveHistory.pop()
      }
      gameData.pendingRequest = null
      return
    }

    if (move.type === 'timeout-forfeit') {
      const forfeitingDisc = gameData.currentDisc
      const winnerDisc: PlayerDisc = forfeitingDisc === 1 ? 2 : 1
      gameData.pendingRequest = null
      gameData.winner = winnerDisc
      gameData.winningLine = null
      this.state.status = 'finished'
      this.state.winner = this.state.players[winnerDisc === 1 ? 0 : 1]?.id
      return
    }

    // drop move
    gameData.pendingRequest = null
    const { col } = move.data as { col: number }

    // find lowest empty row in this column (gravity)
    let landRow = -1
    for (let r = ROWS - 1; r >= 0; r--) {
      if (gameData.board[r][col] === null) {
        landRow = r
        break
      }
    }
    if (landRow === -1) return

    gameData.undoSnapshots.push(this.captureSnapshot(gameData))
    gameData.board[landRow][col] = gameData.currentDisc
    gameData.moveCount += 1
    gameData.lastDroppedRow = landRow
    gameData.lastDroppedCol = col
    gameData.moveHistory.push({ disc: gameData.currentDisc, col, row: landRow, timestamp: move.timestamp.getTime() })

    const winningLine = this.checkForWinner(gameData.board, landRow, col)
    if (winningLine) {
      gameData.winner = gameData.currentDisc
      gameData.winningLine = winningLine
      this.state.status = 'finished'
      this.state.winner = this.state.players[gameData.currentDisc === 1 ? 0 : 1]?.id

      const winnerPlayer = this.state.players[gameData.currentDisc === 1 ? 0 : 1]
      const loserPlayer = this.state.players[gameData.currentDisc === 1 ? 1 : 0]
      if (winnerPlayer) winnerPlayer.score = (winnerPlayer.score ?? 0) + 1
      if (loserPlayer) loserPlayer.score = loserPlayer.score ?? 0
      return
    }

    // draw — board full
    if (gameData.moveCount === ROWS * COLS) {
      gameData.winner = 'draw'
      gameData.winningLine = null
      this.state.status = 'finished'
      this.state.winner = undefined
      return
    }

    gameData.currentDisc = gameData.currentDisc === 1 ? 2 : 1
  }

  checkWinCondition(): Player | null {
    const gameData = this.state.data as ConnectFourGameData
    if (gameData.winner === null || gameData.winner === 'draw') return null
    const winnerIndex = gameData.winner === 1 ? 0 : 1
    return this.state.players[winnerIndex] || null
  }

  getGameRules(): string[] {
    return [
      'Two players take turns dropping discs into a 7-column, 6-row grid',
      'Discs fall to the lowest available row in the chosen column',
      'First to connect four discs in a row wins (horizontal, vertical, or diagonal)',
      'If all 42 cells are filled with no winner, the game is a draw',
    ]
  }

  protected canProcessMoveWhenNotPlaying(move: Move): boolean {
    return (
      this.state.status === 'finished' &&
      (move.type === 'next-round' || move.type === 'request-undo' || move.type === 'respond-undo')
    )
  }

  protected shouldAdvanceTurn(move: Move): boolean {
    return move.type === 'drop' && this.state.status === 'playing'
  }

  getPendingRequest(): ConnectFourPendingRequest | null {
    const gameData = this.state.data as ConnectFourGameData
    return gameData.pendingRequest ? { ...gameData.pendingRequest } : null
  }

  /** Returns the lowest available row index in a column, or -1 if full. */
  getDropRow(col: number): number {
    const gameData = this.state.data as ConnectFourGameData
    for (let r = ROWS - 1; r >= 0; r--) {
      if (gameData.board[r][col] === null) return r
    }
    return -1
  }

  /** Returns list of columns that still have room. */
  getAvailableColumns(): number[] {
    const gameData = this.state.data as ConnectFourGameData
    const cols: number[] = []
    for (let c = 0; c < COLS; c++) {
      if (gameData.board[0][c] === null) cols.push(c)
    }
    return cols
  }

  private resolveResponderId(requesterId: string): string | null {
    const responder = this.state.players.find((p) => p.id !== requesterId)
    return responder?.id ?? null
  }

  private captureSnapshot(gameData: ConnectFourGameData): ConnectFourUndoSnapshot {
    return {
      board: gameData.board.map((row) => [...row]),
      currentDisc: gameData.currentDisc,
      winner: gameData.winner,
      winningLine: gameData.winningLine ? gameData.winningLine.map(([r, c]) => [r, c] as [number, number]) : null,
      moveCount: gameData.moveCount,
      currentPlayerIndex: this.state.currentPlayerIndex,
      status: 'playing',
      lastDroppedRow: gameData.lastDroppedRow,
      lastDroppedCol: gameData.lastDroppedCol,
    }
  }

  private undoLastMove(gameData: ConnectFourGameData): void {
    const snapshot = gameData.undoSnapshots?.pop()
    if (!snapshot) return

    gameData.board = snapshot.board.map((row) => [...row])
    gameData.currentDisc = snapshot.currentDisc
    gameData.winner = snapshot.winner
    gameData.winningLine = snapshot.winningLine ? snapshot.winningLine.map(([r, c]) => [r, c] as [number, number]) : null
    gameData.moveCount = snapshot.moveCount
    gameData.lastDroppedRow = snapshot.lastDroppedRow
    gameData.lastDroppedCol = snapshot.lastDroppedCol

    this.state.currentPlayerIndex = snapshot.currentPlayerIndex
    this.state.status = snapshot.status
    this.state.winner = undefined
    this.state.lastMoveAt = Date.now()
  }

  checkForWinner(board: CellValue[][], lastRow: number, lastCol: number): [number, number][] | null {
    const disc = board[lastRow][lastCol]
    if (disc === null) return null

    const directions: [number, number][] = [
      [0, 1],   // horizontal
      [1, 0],   // vertical
      [1, 1],   // diagonal ↘
      [1, -1],  // diagonal ↙
    ]

    for (const [dr, dc] of directions) {
      const line: [number, number][] = [[lastRow, lastCol]]

      for (let step = 1; step <= 3; step++) {
        const r = lastRow + dr * step
        const c = lastCol + dc * step
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== disc) break
        line.push([r, c])
      }

      for (let step = 1; step <= 3; step++) {
        const r = lastRow - dr * step
        const c = lastCol - dc * step
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== disc) break
        line.push([r, c])
      }

      if (line.length >= 4) return line.slice(0, 4)
    }

    return null
  }
}
