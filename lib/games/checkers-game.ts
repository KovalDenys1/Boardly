import { GameEngine, Player, Move, GameConfig } from '../game-engine'

/**
 * Standard English checkers (#1083).
 *
 * 8×8 board, pieces on the dark squares ((row + col) is odd), twelve men a side.
 * Side 1 sits on rows 5-7 and moves up the board (towards row 0); side 2 sits on
 * rows 0-2 and moves down. Side 1 is seat 0 and moves first.
 *
 * The server applies one hop per move. A capture that leaves the same piece with
 * another capture keeps the turn (`chainFrom`), so a multi-jump arrives as a run
 * of `step` moves from one player without the turn index advancing. Captured
 * pieces stay on the board as `pendingCaptures` until the turn ends: in English
 * draughts they are lifted after the whole move, so a piece may not be jumped
 * twice and its square cannot be landed on mid-chain.
 */

export type Side = 1 | 2
/** 0 empty, 1/2 a man of that side, 3/4 a king of side 1/2. */
export type CheckersCell = 0 | 1 | 2 | 3 | 4
export type Square = [number, number]

export const BOARD_SIZE = 8
/** 40 moves by each side without a capture or a man moving is a draw. */
export const DRAW_PLY_LIMIT = 80

export interface CheckersStep {
  from: Square
  to: Square
  /** The square of the piece jumped, or null for a plain move. */
  capture: Square | null
}

export interface CheckersMoveRecord {
  side: Side
  /** Every square the piece stood on this turn, start first. */
  path: Square[]
  captured: Square[]
  promoted: boolean
  timestamp: number
}

export type CheckersEndReason = 'no-moves' | 'draw-rule' | 'timeout'

export interface CheckersGameData {
  board: CheckersCell[][]
  currentSide: Side
  winner: Side | 'draw' | null
  endReason: CheckersEndReason | null
  /** The piece in the middle of a multi-jump; only it may move, and only to capture. */
  chainFrom: Square | null
  /** Pieces jumped this turn, lifted when the turn ends. */
  pendingCaptures: Square[]
  /** Plies since the last capture or man move. */
  quietPlies: number
  /** Completed turns. */
  moveCount: number
  lastMove: CheckersMoveRecord | null
  moveHistory: CheckersMoveRecord[]
}

// ─── Pure board helpers (shared by the engine, the bot and the page) ────────

export function pieceSide(cell: number): Side | null {
  if (cell === 1 || cell === 3) return 1
  if (cell === 2 || cell === 4) return 2
  return null
}

export function isKing(cell: number): boolean {
  return cell === 3 || cell === 4
}

export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1
}

export function promotionRow(side: Side): number {
  return side === 1 ? 0 : BOARD_SIZE - 1
}

export function otherSide(side: Side): Side {
  return side === 1 ? 2 : 1
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE
}

function directionsFor(cell: number): Square[] {
  if (isKing(cell)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  return pieceSide(cell) === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]
}

function containsSquare(list: readonly Square[], r: number, c: number): boolean {
  return list.some(([lr, lc]) => lr === r && lc === c)
}

export function createInitialBoard(): CheckersCell[][] {
  return Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c): CheckersCell => {
      if (!isDarkSquare(r, c)) return 0
      if (r <= 2) return 2
      if (r >= 5) return 1
      return 0
    })
  )
}

/** Captures available to the piece on (r, c). Squares in `jumped` were taken earlier this turn. */
export function getJumpsFrom(
  board: readonly (readonly number[])[],
  r: number,
  c: number,
  jumped: readonly Square[] = []
): CheckersStep[] {
  const cell = board[r]?.[c] ?? 0
  const side = pieceSide(cell)
  if (!side) return []
  const steps: CheckersStep[] = []
  for (const [dr, dc] of directionsFor(cell)) {
    const mr = r + dr
    const mc = c + dc
    const lr = r + 2 * dr
    const lc = c + 2 * dc
    if (!inBounds(lr, lc)) continue
    const middle = board[mr][mc]
    if (pieceSide(middle) !== otherSide(side)) continue
    if (containsSquare(jumped, mr, mc)) continue
    if (board[lr][lc] !== 0) continue
    steps.push({ from: [r, c], to: [lr, lc], capture: [mr, mc] })
  }
  return steps
}

function getSimpleMovesFrom(board: readonly (readonly number[])[], r: number, c: number): CheckersStep[] {
  const cell = board[r][c]
  if (!pieceSide(cell)) return []
  const steps: CheckersStep[] = []
  for (const [dr, dc] of directionsFor(cell)) {
    const tr = r + dr
    const tc = c + dc
    if (inBounds(tr, tc) && board[tr][tc] === 0) {
      steps.push({ from: [r, c], to: [tr, tc], capture: null })
    }
  }
  return steps
}

/**
 * Every single hop `side` may make now. Captures are mandatory: when any piece
 * can capture, only captures are returned. Mid-chain, only the chain piece's
 * captures are.
 */
export function getLegalSteps(
  board: readonly (readonly number[])[],
  side: Side,
  chainFrom: Square | null = null,
  jumped: readonly Square[] = []
): CheckersStep[] {
  if (chainFrom) return getJumpsFrom(board, chainFrom[0], chainFrom[1], jumped)
  const jumps: CheckersStep[] = []
  const moves: CheckersStep[] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (pieceSide(board[r][c]) !== side) continue
      jumps.push(...getJumpsFrom(board, r, c, jumped))
      if (jumps.length === 0) moves.push(...getSimpleMovesFrom(board, r, c))
    }
  }
  return jumps.length > 0 ? jumps : moves
}

/**
 * Whether `side` has any legal move at all. Stops at the first one found, so it
 * costs a fraction of `getLegalSteps` – the bot asks it at every leaf.
 */
export function hasLegalMove(board: readonly (readonly number[])[], side: Side): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c]
      if (pieceSide(cell) !== side) continue
      for (const [dr, dc] of directionsFor(cell)) {
        const tr = r + dr
        const tc = c + dc
        if (!inBounds(tr, tc)) continue
        if (board[tr][tc] === 0) return true
        const lr = r + 2 * dr
        const lc = c + 2 * dc
        if (inBounds(lr, lc) && pieceSide(board[tr][tc]) === otherSide(side) && board[lr][lc] === 0) return true
      }
    }
  }
  return false
}

/** Squares of the pieces that are able to capture right now – the ones the player must choose from. */
export function getForcedCapturePieces(board: readonly (readonly number[])[], side: Side): Square[] {
  const pieces: Square[] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (pieceSide(board[r][c]) === side && getJumpsFrom(board, r, c).length > 0) pieces.push([r, c])
    }
  }
  return pieces
}

/** A whole turn: one plain move, or a complete capture chain. */
export interface CheckersTurn {
  steps: CheckersStep[]
  captures: number
  promotes: boolean
}

/**
 * Every complete turn `side` can play, with capture chains followed to their
 * end. Used by the bot and by the tests; the engine itself validates hop by hop.
 */
export function generateTurns(board: readonly (readonly number[])[], side: Side): CheckersTurn[] {
  const first = getLegalSteps(board, side)
  if (first.length === 0) return []
  if (first[0].capture === null) {
    return first.map((step) => ({
      steps: [step],
      captures: 0,
      promotes: !isKing(board[step.from[0]][step.from[1]]) && step.to[0] === promotionRow(side),
    }))
  }

  const turns: CheckersTurn[] = []
  const extend = (work: CheckersCell[][], steps: CheckersStep[], jumped: Square[]) => {
    const last = steps[steps.length - 1]
    const [r, c] = last.to
    const cell = work[r][c]
    const next = getJumpsFrom(work, r, c, jumped)
    if (next.length === 0) {
      turns.push({ steps, captures: steps.length, promotes: false })
      return
    }
    for (const step of next) {
      const promotes = !isKing(cell) && step.to[0] === promotionRow(side)
      const board2 = work.map((row) => [...row]) as CheckersCell[][]
      board2[step.to[0]][step.to[1]] = promotes ? ((side + 2) as CheckersCell) : cell
      board2[r][c] = 0
      const nextSteps = [...steps, step]
      if (promotes) {
        turns.push({ steps: nextSteps, captures: nextSteps.length, promotes: true })
      } else {
        extend(board2, nextSteps, [...jumped, step.capture as Square])
      }
    }
  }

  for (const step of first) {
    const cell = board[step.from[0]][step.from[1]]
    const promotes = !isKing(cell) && step.to[0] === promotionRow(side)
    const work = board.map((row) => [...row]) as CheckersCell[][]
    work[step.to[0]][step.to[1]] = promotes ? ((side + 2) as CheckersCell) : (cell as CheckersCell)
    work[step.from[0]][step.from[1]] = 0
    if (promotes) {
      turns.push({ steps: [step], captures: 1, promotes: true })
    } else {
      extend(work, [step], [step.capture as Square])
    }
  }
  return turns
}

/** The board after a whole turn, with the jumped pieces lifted. */
export function applyTurn(board: readonly (readonly number[])[], turn: CheckersTurn): CheckersCell[][] {
  const next = board.map((row) => [...row]) as CheckersCell[][]
  const start = turn.steps[0].from
  const end = turn.steps[turn.steps.length - 1].to
  const cell = next[start[0]][start[1]]
  const side = pieceSide(cell) as Side
  next[start[0]][start[1]] = 0
  for (const step of turn.steps) {
    if (step.capture) next[step.capture[0]][step.capture[1]] = 0
  }
  next[end[0]][end[1]] = turn.promotes ? ((side + 2) as CheckersCell) : cell
  return next
}

/** Whether `a` is the square (r, c). Shared with the page, so the two can never disagree. */
export function sameSquare(a: unknown, r: number, c: number): boolean {
  return Array.isArray(a) && a[0] === r && a[1] === c
}

function readSquare(value: unknown): Square | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [r, c] = value
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inBounds(r as number, c as number)) return null
  return [r as number, c as number]
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class CheckersGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 2, minPlayers: 2 }) {
    super(gameId, 'checkers', config)
  }

  getInitialGameData(): CheckersGameData {
    return {
      board: createInitialBoard(),
      currentSide: 1,
      winner: null,
      endReason: null,
      chainFrom: null,
      pendingCaptures: [],
      quietPlies: 0,
      moveCount: 0,
      lastMove: null,
      moveHistory: [],
    }
  }

  protected normalizeRestoredData(): void {
    // A snapshot without game data (a waiting lobby) restores to the opening position.
    const raw = this.state.data as Partial<CheckersGameData> | null | undefined
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.board)) {
      this.state.data = this.getInitialGameData()
      return
    }
    const data = raw as CheckersGameData
    data.moveHistory = Array.isArray(data.moveHistory) ? data.moveHistory : []
    data.pendingCaptures = Array.isArray(data.pendingCaptures) ? data.pendingCaptures : []
    data.chainFrom = readSquare(data.chainFrom)
    data.lastMove = data.lastMove ?? null
    data.endReason = data.endReason ?? null
    data.quietPlies = typeof data.quietPlies === 'number' ? data.quietPlies : 0
    this.syncSideToSeat()
  }

  private get data(): CheckersGameData {
    return this.state.data as CheckersGameData
  }

  /**
   * The side to move is the seat on the clock – seat 0 plays side 1 – and
   * nothing else (PR #1097 review). The state route skips a disconnected seat by
   * moving `currentPlayerIndex` alone (`advanceTurnPastDisconnectedPlayers`), so a
   * stored `currentSide` that is trusted on its own drifts from the seat, and the
   * seat that inherits the turn could then move the other side's pieces.
   * `data.currentSide` stays in the state for the page and old snapshots, but it
   * is rewritten from the seat before anything reads it.
   */
  private seatSide(): Side {
    return ((this.state.currentPlayerIndex ?? 0) % 2 === 0 ? 1 : 2) as Side
  }

  private syncSideToSeat(): void {
    const data = this.data
    if (!data || !Array.isArray(data.board)) return
    const side = this.seatSide()
    data.currentSide = side
    if (data.winner !== null) return

    // A capture chain left open by a seat that was skipped belongs to nobody on
    // the clock now. English draughts lifts jumped pieces when the move ends, so
    // the abandoned move ends here: its captures come off and the chain closes.
    const chain = data.chainFrom
    if (chain && pieceSide(data.board[chain[0]]?.[chain[1]] ?? 0) !== side) {
      for (const [r, c] of data.pendingCaptures) data.board[r][c] = 0
      data.pendingCaptures = []
      data.chainFrom = null
      data.moveCount += 1
      data.quietPlies = 0
      if (this.state.status === 'playing' && getLegalSteps(data.board, side).length === 0) {
        this.finish(otherSide(side), 'no-moves')
      }
    }
  }

  /** Every turn hand-over goes through here, so the side follows the seat. */
  protected advanceTurnIndex(): void {
    super.advanceTurnIndex()
    this.syncSideToSeat()
  }

  /** Legal single hops for the side to move, honouring an unfinished chain. */
  getLegalSteps(): CheckersStep[] {
    this.syncSideToSeat()
    const data = this.data
    if (this.state.status !== 'playing' || data.winner !== null) return []
    return getLegalSteps(data.board, data.currentSide, data.chainFrom, data.pendingCaptures)
  }

  validateMove(move: Move): boolean {
    this.syncSideToSeat()
    const data = this.data

    if (move.type === 'next-round') {
      if (this.state.status !== 'finished') return false
      return this.state.players.some((p) => p.id === move.playerId)
    }

    const playerIndex = this.state.players.findIndex((p) => p.id === move.playerId)
    if (playerIndex === -1 || playerIndex !== this.state.currentPlayerIndex) return false
    if (this.state.status !== 'playing' || data.winner !== null) return false

    if (move.type === 'timeout-forfeit') return true
    if (move.type !== 'step') return false

    const from = readSquare((move.data as { from?: unknown }).from)
    const to = readSquare((move.data as { to?: unknown }).to)
    if (!from || !to) return false
    // The seat's own side, never a stored field that could have drifted from it.
    if (pieceSide(data.board[from[0]][from[1]]) !== playerIndex + 1) return false

    return this.getLegalSteps().some(
      (step) => sameSquare(step.from, from[0], from[1]) && sameSquare(step.to, to[0], to[1])
    )
  }

  processMove(move: Move): void {
    const data = this.data

    if (move.type === 'next-round') {
      Object.assign(data, this.getInitialGameData())
      this.state.currentPlayerIndex = 0
      this.state.status = 'playing'
      this.state.winner = undefined
      this.state.lastMoveAt = Date.now()
      this.syncSideToSeat()
      return
    }

    if (move.type === 'timeout-forfeit') {
      // The opponent of the seat whose clock ran out.
      const seat = this.state.players.findIndex((p) => p.id === move.playerId)
      this.finish(otherSide((seat + 1) as Side), 'timeout')
      return
    }

    this.syncSideToSeat()

    const from = readSquare((move.data as { from?: unknown }).from) as Square
    const to = readSquare((move.data as { to?: unknown }).to) as Square
    const step = this.getLegalSteps().find(
      (s) => sameSquare(s.from, from[0], from[1]) && sameSquare(s.to, to[0], to[1])
    )
    if (!step) return

    const side = data.currentSide
    const cell = data.board[from[0]][from[1]]
    const wasMan = !isKing(cell)
    const promotes = wasMan && to[0] === promotionRow(side)

    data.board[from[0]][from[1]] = 0
    data.board[to[0]][to[1]] = promotes ? ((side + 2) as CheckersCell) : cell

    // One record per turn: a chain hop extends the record the turn opened.
    const continuing = data.chainFrom !== null && data.lastMove !== null
    const record: CheckersMoveRecord = continuing
      ? (data.lastMove as CheckersMoveRecord)
      : { side, path: [[from[0], from[1]]], captured: [], promoted: false, timestamp: move.timestamp.getTime() }
    record.path.push([to[0], to[1]])
    if (step.capture) record.captured.push([step.capture[0], step.capture[1]])
    record.promoted = record.promoted || promotes
    if (!continuing) data.moveHistory.push(record)
    else data.moveHistory[data.moveHistory.length - 1] = record
    data.lastMove = record

    if (step.capture) {
      data.pendingCaptures.push([step.capture[0], step.capture[1]])
      // Promotion ends the turn even when the new king could jump again.
      if (!promotes && getJumpsFrom(data.board, to[0], to[1], data.pendingCaptures).length > 0) {
        data.chainFrom = [to[0], to[1]]
        return
      }
    }

    this.endTurn(record, wasMan)
  }

  private endTurn(record: CheckersMoveRecord, wasMan: boolean): void {
    const data = this.data
    for (const [r, c] of data.pendingCaptures) data.board[r][c] = 0
    data.pendingCaptures = []
    data.chainFrom = null
    data.moveCount += 1
    data.quietPlies = record.captured.length > 0 || wasMan ? 0 : data.quietPlies + 1

    const mover = record.side
    const next = otherSide(mover)
    if (getLegalSteps(data.board, next).length === 0) {
      this.finish(mover, 'no-moves')
      return
    }
    if (data.quietPlies >= DRAW_PLY_LIMIT) {
      data.winner = 'draw'
      data.endReason = 'draw-rule'
      this.state.status = 'finished'
      this.state.winner = undefined
      return
    }
    // The side to move follows the seat: makeMove's advanceTurnIndex hands the
    // turn over and syncSideToSeat sets currentSide from it.
  }

  private finish(winnerSide: Side, reason: CheckersEndReason): void {
    const data = this.data
    data.winner = winnerSide
    data.endReason = reason
    data.chainFrom = null
    for (const [r, c] of data.pendingCaptures) data.board[r][c] = 0
    data.pendingCaptures = []
    this.state.status = 'finished'
    const winner = this.state.players[winnerSide - 1]
    this.state.winner = winner?.id
    if (winner) winner.score = (winner.score ?? 0) + 1
    const loser = this.state.players[otherSide(winnerSide) - 1]
    if (loser) loser.score = loser.score ?? 0
  }

  checkWinCondition(): Player | null {
    const data = this.data
    if (data.winner === null || data.winner === 'draw') return null
    return this.state.players[data.winner - 1] || null
  }

  getGameRules(): string[] {
    return [
      'Two players on an 8×8 board, twelve pieces each on the dark squares; dark moves first',
      'Men move one square diagonally forward; kings move one square diagonally in any direction',
      'Capturing is mandatory, and a capture chain must be finished by the same piece',
      'A man reaching the far row becomes a king, which ends the turn',
      'A player with no legal move loses; 40 moves each without a capture or a man move is a draw',
    ]
  }

  protected canProcessMoveWhenNotPlaying(move: Move): boolean {
    return this.state.status === 'finished' && move.type === 'next-round'
  }

  /** The turn passes only once a hop ends it – never in the middle of a capture chain. */
  protected shouldAdvanceTurn(move: Move): boolean {
    return move.type === 'step' && this.state.status === 'playing' && this.data.chainFrom === null
  }
}
