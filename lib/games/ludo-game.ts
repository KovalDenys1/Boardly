import { GameEngine, Player, Move, GameConfig } from '../game-engine'

/**
 * Ludo (#1084) – common international rules on the cross-shaped board.
 *
 * Positions are relative to the token's own colour, which keeps every rule a
 * comparison of small integers:
 *   -1        in the yard
 *   0..50     on the shared 52-square track, 0 being the colour's start square
 *   51..55    the colour's own home column (nobody else can land there)
 *   56        home – the token is finished
 *
 * The absolute track square of a relative position is (START_OFFSET + r) % 52,
 * which is what captures and safe squares are judged on.
 *
 * The server rolls the die. `roll` ignores anything the client sends in
 * `move.data`, and the client never runs `processMove` for a roll – it waits for
 * the authoritative state instead – so there is no way to pick your own number.
 */

export const LUDO_TRACK_LENGTH = 52
export const LUDO_LAST_TRACK_STEP = 50
export const LUDO_HOME_COLUMN_START = 51
export const LUDO_FINISH = 56
export const LUDO_YARD = -1
/** Rolls kept per player for the on-screen roll history. */
export const LUDO_ROLL_HISTORY_LIMIT = 10
/** Log entries kept in state for the moves list. */
export const LUDO_EVENT_LOG_LIMIT = 60

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue'
export type LudoMode = 'quick' | 'classic'
export type LudoPhase = 'roll' | 'move'

/** Clockwise order around the board; each colour starts 13 squares after the previous one. */
export const LUDO_COLORS: readonly LudoColor[] = ['red', 'green', 'yellow', 'blue']

export const LUDO_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
}

/** Start squares and the star squares eight steps after each of them. */
export const LUDO_SAFE_SQUARES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47])

/** Two players sit opposite each other; three leave one corner empty. */
const COLORS_BY_PLAYER_COUNT: Record<number, LudoColor[]> = {
  1: ['red'],
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
}

export function normalizeLudoMode(value: unknown): LudoMode {
  return value === 'classic' ? 'classic' : 'quick'
}

export function tokensForMode(mode: LudoMode): number {
  return mode === 'classic' ? 4 : 2
}

export interface LudoSeat {
  playerId: string
  color: LudoColor
}

export type LudoEventKind =
  | 'move'
  | 'enter'
  | 'capture'
  | 'home'
  | 'no-move'
  | 'triple-six'

export interface LudoEvent {
  /** Running number, so the list has a stable key and a visible order. */
  n: number
  playerId: string
  roll: number
  kind: LudoEventKind
  token?: number
  from?: number
  to?: number
  capturedPlayerIds?: string[]
  /** True when the turn clock ran out and the server moved for the player. */
  auto?: boolean
  at: number
}

export interface LudoLastMove {
  playerId: string
  token: number
  from: number
  to: number
  captured: Array<{ playerId: string; token: number; from: number }>
  at: number
}

export interface LudoGameData {
  mode: LudoMode
  tokensPerPlayer: number
  seats: LudoSeat[]
  /** Relative position of every token, keyed by player id. */
  tokens: Record<string, number[]>
  phase: LudoPhase
  /** The player the phase/dice fields belong to; anything else is a stale turn. */
  turnPlayerId: string | null
  dice: number | null
  legalTokens: number[]
  consecutiveSixes: number
  lastRoll: { playerId: string; value: number; at: number } | null
  lastMove: LudoLastMove | null
  rollHistory: Record<string, number[]>
  events: LudoEvent[]
  eventCount: number
  /** Best first, written when the game ends. */
  ranking: string[]
  winnerId: string | null
}

export interface LudoMoveOption {
  token: number
  from: number
  to: number
  /** Opponent tokens this move sends back to their yard. */
  captures: Array<{ playerId: string; token: number; from: number }>
  entersBoard: boolean
  reachesHome: boolean
}

function rollDie(): number {
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto
  if (cryptoApi?.getRandomValues) {
    // Rejection sampling keeps the six faces exactly uniform.
    const buffer = new Uint32Array(1)
    const limit = Math.floor(0x100000000 / 6) * 6
    for (let attempt = 0; attempt < 16; attempt += 1) {
      cryptoApi.getRandomValues(buffer)
      if (buffer[0] < limit) return (buffer[0] % 6) + 1
    }
  }
  return Math.floor(Math.random() * 6) + 1
}

/** The absolute track square of a relative position, or null off the shared track. */
export function absoluteSquare(color: LudoColor, relative: number): number | null {
  if (relative < 0 || relative > LUDO_LAST_TRACK_STEP) return null
  return (LUDO_START_OFFSET[color] + relative) % LUDO_TRACK_LENGTH
}

export function isSafeSquare(absolute: number): boolean {
  return LUDO_SAFE_SQUARES.has(absolute)
}

export class LudoGame extends GameEngine {
  /** Set by processMove, read by shouldAdvanceTurn in the same makeMove call. */
  private turnEnded = false

  constructor(gameId: string, config: GameConfig = { maxPlayers: 4, minPlayers: 2 }) {
    super(gameId, 'ludo', config)
  }

  getInitialGameData(): LudoGameData {
    // this.config is assigned before getInitialGameData() runs in the GameEngine constructor
    const mode = normalizeLudoMode(this.config?.rules?.mode)
    return {
      mode,
      tokensPerPlayer: tokensForMode(mode),
      seats: [],
      tokens: {},
      phase: 'roll',
      turnPlayerId: null,
      dice: null,
      legalTokens: [],
      consecutiveSixes: 0,
      lastRoll: null,
      lastMove: null,
      rollHistory: {},
      events: [],
      eventCount: 0,
      ranking: [],
      winnerId: null,
    }
  }

  protected normalizeRestoredData(): void {
    const data = this.state.data as Partial<LudoGameData> | undefined
    if (!data || typeof data !== 'object') {
      this.state.data = this.getInitialGameData()
      return
    }
    data.mode = normalizeLudoMode(data.mode)
    data.tokensPerPlayer = typeof data.tokensPerPlayer === 'number' ? data.tokensPerPlayer : tokensForMode(data.mode)
    data.seats = Array.isArray(data.seats) ? data.seats : []
    data.tokens = data.tokens && typeof data.tokens === 'object' ? data.tokens : {}
    data.phase = data.phase === 'move' ? 'move' : 'roll'
    data.turnPlayerId = typeof data.turnPlayerId === 'string' ? data.turnPlayerId : null
    data.dice = typeof data.dice === 'number' ? data.dice : null
    data.legalTokens = Array.isArray(data.legalTokens) ? data.legalTokens : []
    data.consecutiveSixes = typeof data.consecutiveSixes === 'number' ? data.consecutiveSixes : 0
    data.lastRoll = data.lastRoll ?? null
    data.lastMove = data.lastMove ?? null
    data.rollHistory = data.rollHistory && typeof data.rollHistory === 'object' ? data.rollHistory : {}
    data.events = Array.isArray(data.events) ? data.events : []
    data.eventCount = typeof data.eventCount === 'number' ? data.eventCount : data.events.length
    data.ranking = Array.isArray(data.ranking) ? data.ranking : []
    data.winnerId = typeof data.winnerId === 'string' ? data.winnerId : null
  }

  startGame(): boolean {
    if (!super.startGame()) return false

    const data = this.getData()
    // game-create rebuilds the engine with startConfig.rules mirrored from the
    // waiting game's state, so the mode is re-read here, like Yahtzee's (#779).
    data.mode = normalizeLudoMode(this.config?.rules?.mode ?? data.mode)
    data.tokensPerPlayer = tokensForMode(data.mode)

    const colors = COLORS_BY_PLAYER_COUNT[this.state.players.length] ?? LUDO_COLORS
    data.seats = this.state.players.map((player, index) => ({
      playerId: player.id,
      color: colors[index] ?? LUDO_COLORS[index % LUDO_COLORS.length],
    }))
    data.tokens = {}
    data.rollHistory = {}
    for (const player of this.state.players) {
      data.tokens[player.id] = Array.from({ length: data.tokensPerPlayer }, () => LUDO_YARD)
      data.rollHistory[player.id] = []
      player.score = 0
    }
    this.resetTurn(this.state.players[this.state.currentPlayerIndex]?.id ?? null)
    return true
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  validateMove(move: Move): boolean {
    if (this.state.status !== 'playing') return false
    const data = this.getData()
    if (data.winnerId) return false

    const current = this.getCurrentPlayer()
    if (!current || current.id !== move.playerId) return false
    this.syncTurnOwner()

    switch (move.type) {
      case 'roll':
        return data.phase === 'roll'
      case 'move': {
        if (data.phase !== 'move') return false
        const token = (move.data as { token?: unknown }).token
        return typeof token === 'number' && Number.isInteger(token) && data.legalTokens.includes(token)
      }
      case 'timeout':
        // The clock ran out: the server finishes whatever step the seat was on.
        return true
      default:
        return false
    }
  }

  processMove(move: Move): void {
    this.turnEnded = false
    this.syncTurnOwner()
    const data = this.getData()
    const at = move.timestamp instanceof Date ? move.timestamp.getTime() : Date.now()

    if (move.type === 'roll') {
      this.applyRoll(move.playerId, at, false)
      return
    }

    if (move.type === 'move') {
      const token = (move.data as { token: number }).token
      const option = this.getMoveOptionsFor(move.playerId, data.dice ?? 0).find((o) => o.token === token)
      if (!option) return
      this.applyOption(move.playerId, option, data.dice ?? 0, at, false)
      return
    }

    if (move.type === 'timeout') {
      if (data.phase === 'roll') {
        this.applyRoll(move.playerId, at, true)
      } else {
        const options = this.getMoveOptionsFor(move.playerId, data.dice ?? 0)
        const pick = pickTimeoutOption(options)
        if (pick) {
          this.applyOption(move.playerId, pick, data.dice ?? 0, at, true)
        } else {
          this.endTurn()
        }
      }
      // An idle player does not get the bonus roll a six would have earned.
      if (!this.turnEnded && !data.winnerId) this.endTurn()
    }
  }

  checkWinCondition(): Player | null {
    const winnerId = this.getData().winnerId
    return winnerId ? this.resolvePlayerWinner(winnerId) : null
  }

  getGameRules(): string[] {
    return [
      'The server rolls the die for every player',
      'Roll a 6 to bring a token out of the yard',
      'A 6 earns another roll; three 6s in a row lose the turn',
      'Landing on an opponent sends their token back to the yard, except on start and star squares',
      'You need the exact number to reach home',
      'First player to bring every token home wins; the rest are ranked by progress',
      'Quick mode plays with 2 tokens each, classic with 4',
    ]
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    return this.turnEnded && this.state.status === 'playing'
  }

  protected advanceTurnIndex(): void {
    super.advanceTurnIndex()
    this.resetTurn(this.state.players[this.state.currentPlayerIndex]?.id ?? null)
  }

  // ─── Queries used by the UI and the bot ────────────────────────────────────

  getData(): LudoGameData {
    return this.state.data as LudoGameData
  }

  getMode(): LudoMode {
    return normalizeLudoMode(this.getData().mode)
  }

  getSeat(playerId: string): LudoSeat | null {
    return this.getData().seats.find((seat) => seat.playerId === playerId) ?? null
  }

  getColor(playerId: string): LudoColor | null {
    return this.getSeat(playerId)?.color ?? null
  }

  getTokens(playerId: string): number[] {
    return [...(this.getData().tokens[playerId] ?? [])]
  }

  /** Phase for the seat on the clock, treating a phase left over from another seat as a fresh turn. */
  getEffectivePhase(): LudoPhase {
    const data = this.getData()
    const current = this.getCurrentPlayer()
    if (!current || data.turnPlayerId !== current.id) return 'roll'
    return data.phase
  }

  tokensHome(playerId: string): number {
    return this.getTokens(playerId).filter((position) => position === LUDO_FINISH).length
  }

  /** Sum of steps travelled, for ranking the players who did not finish. */
  progress(playerId: string): number {
    return this.getTokens(playerId).reduce((total, position) => total + Math.max(0, position + 1), 0)
  }

  /** Every legal move for `playerId` with die `roll`, in token order. */
  getMoveOptionsFor(playerId: string, roll: number): LudoMoveOption[] {
    const color = this.getColor(playerId)
    if (!color || roll < 1 || roll > 6) return []
    const tokens = this.getData().tokens[playerId] ?? []
    const options: LudoMoveOption[] = []

    tokens.forEach((from, token) => {
      let to: number
      if (from === LUDO_FINISH) return
      if (from === LUDO_YARD) {
        if (roll !== 6) return
        to = 0
      } else {
        to = from + roll
        if (to > LUDO_FINISH) return
      }
      options.push({
        token,
        from,
        to,
        captures: this.capturesAt(playerId, color, to),
        entersBoard: from === LUDO_YARD,
        reachesHome: to === LUDO_FINISH,
      })
    })

    return options
  }

  /** Who is sitting on the square `playerId` would land on at relative `to`. */
  private capturesAt(playerId: string, color: LudoColor, to: number): LudoMoveOption['captures'] {
    const square = absoluteSquare(color, to)
    if (square === null || isSafeSquare(square)) return []
    const data = this.getData()
    const captured: LudoMoveOption['captures'] = []
    for (const seat of data.seats) {
      if (seat.playerId === playerId) continue
      const positions = data.tokens[seat.playerId] ?? []
      positions.forEach((position, token) => {
        if (absoluteSquare(seat.color, position) === square) {
          captured.push({ playerId: seat.playerId, token, from: position })
        }
      })
    }
    return captured
  }

  // ─── Turn mechanics ────────────────────────────────────────────────────────

  private applyRoll(playerId: string, at: number, isTimeout: boolean): void {
    const data = this.getData()
    const value = rollDie()

    data.lastRoll = { playerId, value, at }
    const history = data.rollHistory[playerId] ?? []
    data.rollHistory[playerId] = [...history, value].slice(-LUDO_ROLL_HISTORY_LIMIT)
    data.consecutiveSixes = value === 6 ? data.consecutiveSixes + 1 : 0

    if (data.consecutiveSixes >= 3) {
      this.logEvent({ playerId, roll: value, kind: 'triple-six', at, auto: isTimeout || undefined })
      this.endTurn()
      return
    }

    const options = this.getMoveOptionsFor(playerId, value)
    if (options.length === 0) {
      this.logEvent({ playerId, roll: value, kind: 'no-move', at, auto: isTimeout || undefined })
      this.endTurn()
      return
    }

    if (options.length === 1 || isTimeout) {
      // Nothing to choose, or nobody there to choose: move straight away.
      const pick = options.length === 1 ? options[0] : pickTimeoutOption(options)
      if (pick) this.applyOption(playerId, pick, value, at, isTimeout)
      return
    }

    data.phase = 'move'
    data.turnPlayerId = playerId
    data.dice = value
    data.legalTokens = options.map((option) => option.token)
  }

  private applyOption(playerId: string, option: LudoMoveOption, roll: number, at: number, isTimeout: boolean): void {
    const data = this.getData()
    const tokens = data.tokens[playerId]
    if (!tokens) return

    tokens[option.token] = option.to
    for (const victim of option.captures) {
      const victimTokens = data.tokens[victim.playerId]
      if (victimTokens) victimTokens[victim.token] = LUDO_YARD
    }

    data.lastMove = {
      playerId,
      token: option.token,
      from: option.from,
      to: option.to,
      captured: option.captures.map((capture) => ({ ...capture })),
      at,
    }

    const kind: LudoEventKind = option.captures.length > 0
      ? 'capture'
      : option.reachesHome
        ? 'home'
        : option.entersBoard
          ? 'enter'
          : 'move'
    this.logEvent({
      playerId,
      roll,
      kind,
      token: option.token,
      from: option.from,
      to: option.to,
      ...(option.captures.length > 0
        ? { capturedPlayerIds: [...new Set(option.captures.map((capture) => capture.playerId))] }
        : {}),
      at,
      auto: isTimeout || undefined,
    })

    this.syncScores()

    if (tokens.every((position) => position === LUDO_FINISH)) {
      this.finishGame(playerId)
      return
    }

    if (roll === 6 && !isTimeout) {
      // Another roll for the same seat.
      data.phase = 'roll'
      data.turnPlayerId = playerId
      data.dice = null
      data.legalTokens = []
      return
    }

    this.endTurn()
  }

  private finishGame(winnerId: string): void {
    const data = this.getData()
    data.winnerId = winnerId
    data.phase = 'roll'
    data.dice = null
    data.legalTokens = []
    const others = this.state.players
      .filter((player) => player.id !== winnerId)
      .sort((a, b) =>
        this.tokensHome(b.id) - this.tokensHome(a.id) ||
        this.progress(b.id) - this.progress(a.id)
      )
    data.ranking = [winnerId, ...others.map((player) => player.id)]
    data.ranking.forEach((playerId, index) => {
      const player = this.state.players.find((candidate) => candidate.id === playerId)
      if (player) (player as Player & { placement?: number }).placement = index + 1
    })
    this.turnEnded = false
  }

  private endTurn(): void {
    const data = this.getData()
    data.phase = 'roll'
    data.dice = null
    data.legalTokens = []
    data.consecutiveSixes = 0
    this.turnEnded = true
  }

  private resetTurn(playerId: string | null): void {
    const data = this.getData()
    data.phase = 'roll'
    data.turnPlayerId = playerId
    data.dice = null
    data.legalTokens = []
    data.consecutiveSixes = 0
  }

  /**
   * A seat can come to hold the turn without this engine handing it over – the
   * leave path and the disconnected-seat skip both move currentPlayerIndex on
   * the raw state (#992). Whatever phase was left behind belonged to someone
   * else, so the new seat starts with a roll.
   */
  private syncTurnOwner(): void {
    const data = this.getData()
    const current = this.getCurrentPlayer()
    if (current && data.turnPlayerId !== current.id) this.resetTurn(current.id)
  }

  private syncScores(): void {
    for (const player of this.state.players) {
      player.score = this.tokensHome(player.id)
    }
  }

  private logEvent(event: Omit<LudoEvent, 'n'>): void {
    const data = this.getData()
    data.eventCount += 1
    const entry: LudoEvent = { n: data.eventCount, ...event }
    if (entry.auto === undefined) delete entry.auto
    data.events = [...data.events, entry].slice(-LUDO_EVENT_LOG_LIMIT)
  }
}

/** The timeout's choice: finish a token, else capture, else the token furthest along. */
function pickTimeoutOption(options: LudoMoveOption[]): LudoMoveOption | null {
  if (options.length === 0) return null
  return [...options].sort((a, b) =>
    Number(b.reachesHome) - Number(a.reachesHome) ||
    b.captures.length - a.captures.length ||
    b.from - a.from
  )[0]
}
