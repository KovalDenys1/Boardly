import { GameEngine, Player, Move, GameConfig } from '../game-engine'

export type CellValue = 'X' | 'O' | null
export type PlayerSymbol = 'X' | 'O'

export interface TicTacToeMatchState {
  targetRounds: number | null
  roundsPlayed: number
  winsBySymbol: Record<PlayerSymbol, number>
  draws: number
}

export interface TicTacToeMoveRecord {
  playerId: string
  symbol: PlayerSymbol
  row: number
  col: number
  timestamp: number
}

export interface TicTacToePendingRequest {
  type: 'undo' | 'draw'
  requesterId: string
  responderId: string
  requestedAt: number
}

interface TicTacToeUndoSnapshot {
  board: CellValue[][]
  currentSymbol: PlayerSymbol
  winner: PlayerSymbol | 'draw' | null
  winningLine: [number, number][] | null
  moveCount: number
  match: TicTacToeMatchState
  currentPlayerIndex: number
  status: 'playing' | 'finished'
}

export interface TicTacToeGameData {
  board: CellValue[][]
  currentSymbol: PlayerSymbol
  winner: PlayerSymbol | 'draw' | null
  winningLine: [number, number][] | null
  moveCount: number
  match?: TicTacToeMatchState
  moveHistory?: TicTacToeMoveRecord[]
  undoSnapshots?: TicTacToeUndoSnapshot[]
  pendingRequest?: TicTacToePendingRequest | null
}

export class TicTacToeGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 2, minPlayers: 2 }) {
    super(gameId, 'ticTacToe', config)
  }

  getInitialGameData(): TicTacToeGameData {
    const match = this.normalizeMatchState(
      (this.config.rules as { matchState?: Partial<TicTacToeMatchState> } | undefined)?.matchState
    )

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
      match,
      moveHistory: [],
      undoSnapshots: [],
      pendingRequest: null,
    }
  }

  validateMove(move: Move): boolean {
    const gameData = this.ensureGameData(this.state.data as TicTacToeGameData)

    if (move.type === 'next-round') {
      const playerIndex = this.state.players.findIndex((player) => player.id === move.playerId)
      if (playerIndex === -1) {
        return false
      }

      if (this.state.status !== 'finished') {
        return false
      }

      if (gameData.pendingRequest) {
        return false
      }

      const match = this.ensureMatchState(gameData)
      return !this.isMatchComplete(match)
    }

    if (move.type === 'request-undo') {
      const playerIndex = this.state.players.findIndex((player) => player.id === move.playerId)
      if (playerIndex === -1) {
        return false
      }

      if (this.state.status !== 'playing' && this.state.status !== 'finished') {
        return false
      }

      if (gameData.pendingRequest || (gameData.moveHistory?.length ?? 0) === 0) {
        return false
      }

      return this.resolveResponderId(move.playerId) !== null
    }

    if (move.type === 'respond-undo') {
      if (gameData.pendingRequest?.type !== 'undo' || gameData.pendingRequest.responderId !== move.playerId) {
        return false
      }

      return typeof move.data.accept === 'boolean'
    }

    if (move.type === 'request-draw') {
      const playerIndex = this.state.players.findIndex((player) => player.id === move.playerId)
      if (playerIndex === -1) {
        return false
      }

      if (this.state.status !== 'playing' || gameData.winner !== null) {
        return false
      }

      if (gameData.pendingRequest || (gameData.moveHistory?.length ?? 0) === 0) {
        return false
      }

      return this.resolveResponderId(move.playerId) !== null
    }

    if (move.type === 'respond-draw') {
      if (gameData.pendingRequest?.type !== 'draw' || gameData.pendingRequest.responderId !== move.playerId) {
        return false
      }

      return typeof move.data.accept === 'boolean'
    }

    if (move.type === 'timeout-forfeit') {
      const playerIndex = this.state.players.findIndex((player) => player.id === move.playerId)
      if (playerIndex === -1 || playerIndex !== this.state.currentPlayerIndex) {
        return false
      }

      if (this.state.status !== 'playing' || gameData.winner !== null || gameData.pendingRequest) {
        return false
      }

      return true
    }

    if (move.type !== 'place') {
      return false
    }

    if (this.state.status !== 'playing') {
      return false
    }

    if (gameData.pendingRequest) {
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
    const gameData = this.ensureGameData(this.state.data as TicTacToeGameData)

    if (move.type === 'next-round') {
      const match = this.ensureMatchState(gameData)
      if (this.isMatchComplete(match)) {
        return
      }

      const nextStartingSymbol: PlayerSymbol = match.roundsPlayed % 2 === 0 ? 'X' : 'O'
      gameData.board = [
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ]
      gameData.currentSymbol = nextStartingSymbol
      gameData.winner = null
      gameData.winningLine = null
      gameData.moveCount = 0
      gameData.moveHistory = []
      gameData.undoSnapshots = []
      gameData.pendingRequest = null

      this.state.currentPlayerIndex = nextStartingSymbol === 'X' ? 0 : 1
      this.state.status = 'playing'
      this.state.winner = undefined
      this.state.lastMoveAt = Date.now()
      return
    }

    if (move.type === 'request-undo' || move.type === 'request-draw') {
      const responderId = this.resolveResponderId(move.playerId)
      if (!responderId) {
        return
      }

      gameData.pendingRequest = {
        type: move.type === 'request-undo' ? 'undo' : 'draw',
        requesterId: move.playerId,
        responderId,
        requestedAt: move.timestamp.getTime(),
      }
      return
    }

    if (move.type === 'respond-undo') {
      const accept = move.data.accept === true
      if (accept) {
        this.undoLastMove(gameData)
      }
      gameData.pendingRequest = null
      return
    }

    if (move.type === 'respond-draw') {
      const accept = move.data.accept === true
      if (accept) {
        gameData.winner = 'draw'
        gameData.winningLine = null
        this.recordRoundResult(gameData, 'draw')
        this.state.status = 'finished'
        this.state.winner = undefined
      }
      gameData.pendingRequest = null
      return
    }

    if (move.type === 'timeout-forfeit') {
      const forfeitingSymbol = gameData.currentSymbol
      const winnerSymbol: PlayerSymbol = forfeitingSymbol === 'X' ? 'O' : 'X'
      gameData.pendingRequest = null
      gameData.winner = winnerSymbol
      gameData.winningLine = null
      this.recordRoundResult(gameData, winnerSymbol)
      this.state.status = 'finished'
      return
    }

    gameData.pendingRequest = null
    gameData.undoSnapshots?.push(this.captureSnapshot(gameData))

    const { row, col } = move.data as { row: number; col: number }
    const currentSymbol = gameData.currentSymbol

    gameData.board[row][col] = currentSymbol
    gameData.moveCount += 1
    gameData.moveHistory?.push({
      playerId: move.playerId,
      symbol: currentSymbol,
      row,
      col,
      timestamp: move.timestamp.getTime(),
    })

    const winningLine = this.checkForWinner(gameData.board)
    if (winningLine) {
      gameData.winner = currentSymbol
      gameData.winningLine = winningLine
      this.recordRoundResult(gameData, currentSymbol)
      this.state.status = 'finished'
      return
    }

    if (gameData.moveCount === 9) {
      gameData.winner = 'draw'
      gameData.winningLine = null
      this.recordRoundResult(gameData, 'draw')
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
      'Match score tracks wins/losses across rounds',
    ]
  }

  protected canProcessMoveWhenNotPlaying(move: Move): boolean {
    return (
      this.state.status === 'finished' &&
      (move.type === 'next-round' || move.type === 'request-undo' || move.type === 'respond-undo')
    )
  }

  protected shouldAdvanceTurn(move: Move): boolean {
    if (move.type !== 'place') {
      return false
    }
    return this.state.status === 'playing'
  }

  getPendingRequest(): TicTacToePendingRequest | null {
    const gameData = this.ensureGameData(this.state.data as TicTacToeGameData)
    return gameData.pendingRequest ? { ...gameData.pendingRequest } : null
  }

  isTheoreticalDraw(): boolean {
    const gameData = this.ensureGameData(this.state.data as TicTacToeGameData)
    if (this.state.status === 'finished') {
      return gameData.winner === 'draw'
    }

    return this.evaluateTheoreticalOutcome(
      gameData.board.map((row) => [...row]),
      gameData.currentSymbol,
    ) === 'draw'
  }

  private getConfiguredTargetRounds(): number | null {
    const rawTargetRounds = (this.config.rules as { targetRounds?: unknown } | undefined)?.targetRounds
    if (rawTargetRounds === null || rawTargetRounds === undefined) {
      return null
    }
    if (
      typeof rawTargetRounds === 'number' &&
      Number.isInteger(rawTargetRounds) &&
      rawTargetRounds > 0
    ) {
      return rawTargetRounds
    }
    return null
  }

  private normalizeMatchState(seed?: Partial<TicTacToeMatchState>): TicTacToeMatchState {
    const configuredTargetRounds = this.getConfiguredTargetRounds()
    const seedWinsBySymbol: Partial<Record<PlayerSymbol, unknown>> =
      seed?.winsBySymbol && typeof seed.winsBySymbol === 'object'
        ? (seed.winsBySymbol as Partial<Record<PlayerSymbol, unknown>>)
        : {}
    const winsX =
      typeof seedWinsBySymbol.X === 'number' && Number.isFinite(seedWinsBySymbol.X)
        ? Math.max(0, Math.floor(seedWinsBySymbol.X))
        : 0
    const winsO =
      typeof seedWinsBySymbol.O === 'number' && Number.isFinite(seedWinsBySymbol.O)
        ? Math.max(0, Math.floor(seedWinsBySymbol.O))
        : 0
    const draws =
      typeof seed?.draws === 'number' && Number.isFinite(seed.draws)
        ? Math.max(0, Math.floor(seed.draws))
        : 0
    const minimumRounds = winsX + winsO + draws
    const seededRounds =
      typeof seed?.roundsPlayed === 'number' && Number.isFinite(seed.roundsPlayed)
        ? Math.max(0, Math.floor(seed.roundsPlayed))
        : minimumRounds
    const roundsPlayed = Math.max(seededRounds, minimumRounds)

    let targetRounds: number | null = configuredTargetRounds
    if (configuredTargetRounds === null && seed && 'targetRounds' in seed) {
      const seedTargetRounds = seed.targetRounds
      if (seedTargetRounds === null || seedTargetRounds === undefined) {
        targetRounds = null
      } else if (
        typeof seedTargetRounds === 'number' &&
        Number.isInteger(seedTargetRounds) &&
        seedTargetRounds > 0
      ) {
        targetRounds = seedTargetRounds
      }
    }

    return {
      targetRounds,
      roundsPlayed,
      winsBySymbol: {
        X: winsX,
        O: winsO,
      },
      draws,
    }
  }

  private ensureMatchState(gameData: TicTacToeGameData): TicTacToeMatchState {
    gameData.match = this.normalizeMatchState(gameData.match)
    return gameData.match
  }

  private ensureGameData(gameData: TicTacToeGameData): TicTacToeGameData {
    gameData.match = this.normalizeMatchState(gameData.match)
    gameData.moveHistory = Array.isArray(gameData.moveHistory) ? gameData.moveHistory : []
    gameData.undoSnapshots = Array.isArray(gameData.undoSnapshots) ? gameData.undoSnapshots : []
    gameData.pendingRequest =
      gameData.pendingRequest &&
      (gameData.pendingRequest.type === 'undo' || gameData.pendingRequest.type === 'draw')
        ? gameData.pendingRequest
        : null
    return gameData
  }

  private isMatchComplete(match: TicTacToeMatchState): boolean {
    if (match.targetRounds === null) {
      return false
    }
    return match.roundsPlayed >= match.targetRounds
  }

  private recordRoundResult(gameData: TicTacToeGameData, result: PlayerSymbol | 'draw') {
    const match = this.ensureMatchState(gameData)
    match.roundsPlayed += 1

    if (result === 'draw') {
      match.draws += 1
    } else {
      match.winsBySymbol[result] += 1
    }

    if (this.state.players[0]) {
      this.state.players[0].score = match.winsBySymbol.X
    }
    if (this.state.players[1]) {
      this.state.players[1].score = match.winsBySymbol.O
    }
  }

  private resolveResponderId(requesterId: string): string | null {
    const responder = this.state.players.find((player) => player.id !== requesterId)
    return responder?.id ?? null
  }

  private captureSnapshot(gameData: TicTacToeGameData): TicTacToeUndoSnapshot {
    return {
      board: gameData.board.map((row) => [...row]),
      currentSymbol: gameData.currentSymbol,
      winner: gameData.winner,
      winningLine: gameData.winningLine ? gameData.winningLine.map(([row, col]) => [row, col]) as [number, number][] : null,
      moveCount: gameData.moveCount,
      match: this.normalizeMatchState(gameData.match),
      currentPlayerIndex: this.state.currentPlayerIndex,
      status: 'playing',
    }
  }

  private undoLastMove(gameData: TicTacToeGameData) {
    const snapshot = gameData.undoSnapshots?.pop()
    if (!snapshot) {
      return
    }

    gameData.board = snapshot.board.map((row) => [...row])
    gameData.currentSymbol = snapshot.currentSymbol
    gameData.winner = snapshot.winner
    gameData.winningLine = snapshot.winningLine ? snapshot.winningLine.map(([row, col]) => [row, col]) as [number, number][] : null
    gameData.moveCount = snapshot.moveCount
    gameData.match = this.normalizeMatchState(snapshot.match)
    gameData.moveHistory = (gameData.moveHistory || []).slice(0, -1)

    this.state.currentPlayerIndex = snapshot.currentPlayerIndex
    this.state.status = snapshot.status
    this.state.winner =
      snapshot.status === 'finished' && snapshot.winner && snapshot.winner !== 'draw'
        ? this.state.players[snapshot.winner === 'X' ? 0 : 1]?.id
        : undefined
    this.state.lastMoveAt = Date.now()

    this.syncPlayerScores(gameData.match)
  }

  private syncPlayerScores(match: TicTacToeMatchState) {
    if (this.state.players[0]) {
      this.state.players[0].score = match.winsBySymbol.X
    }
    if (this.state.players[1]) {
      this.state.players[1].score = match.winsBySymbol.O
    }
  }

  private evaluateTheoreticalOutcome(board: CellValue[][], nextSymbol: PlayerSymbol): PlayerSymbol | 'draw' {
    const winnerLine = this.checkForWinner(board)
    if (winnerLine) {
      const [row, col] = winnerLine[0]
      return board[row][col] as PlayerSymbol
    }

    const emptyCells: Array<{ row: number; col: number }> = []
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (board[row][col] === null) {
          emptyCells.push({ row, col })
        }
      }
    }

    if (emptyCells.length === 0) {
      return 'draw'
    }

    const opponentSymbol: PlayerSymbol = nextSymbol === 'X' ? 'O' : 'X'
    let canForceDraw = false

    for (const cell of emptyCells) {
      const nextBoard = board.map((row) => [...row])
      nextBoard[cell.row][cell.col] = nextSymbol
      const outcome = this.evaluateTheoreticalOutcome(nextBoard, opponentSymbol)
      if (outcome === nextSymbol) {
        return nextSymbol
      }
      if (outcome === 'draw') {
        canForceDraw = true
      }
    }

    return canForceDraw ? 'draw' : opponentSymbol
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
