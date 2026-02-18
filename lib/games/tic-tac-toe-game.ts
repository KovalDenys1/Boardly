import { GameEngine, Player, Move, GameConfig } from '../game-engine'

export type CellValue = 'X' | 'O' | null
export type PlayerSymbol = 'X' | 'O'

export interface TicTacToeMatchState {
  targetRounds: number | null
  roundsPlayed: number
  winsBySymbol: Record<PlayerSymbol, number>
  draws: number
}

export interface TicTacToeGameData {
  board: CellValue[][]
  currentSymbol: PlayerSymbol
  winner: PlayerSymbol | 'draw' | null
  winningLine: [number, number][] | null
  moveCount: number
  match?: TicTacToeMatchState
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
    }
  }

  validateMove(move: Move): boolean {
    const gameData = this.state.data as TicTacToeGameData

    if (move.type === 'next-round') {
      const playerIndex = this.state.players.findIndex((player) => player.id === move.playerId)
      if (playerIndex === -1) {
        return false
      }

      if (this.state.status !== 'finished') {
        return false
      }

      const match = this.ensureMatchState(gameData)
      return !this.isMatchComplete(match)
    }

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

      this.state.currentPlayerIndex = nextStartingSymbol === 'X' ? 0 : 1
      this.state.status = 'playing'
      this.state.winner = undefined
      this.state.lastMoveAt = Date.now()
      return
    }

    const { row, col } = move.data as { row: number; col: number }
    const currentSymbol = gameData.currentSymbol

    gameData.board[row][col] = currentSymbol
    gameData.moveCount += 1

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

  protected shouldAdvanceTurn(move: Move): boolean {
    if (move.type === 'next-round') {
      return false
    }
    return this.state.status === 'playing'
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
