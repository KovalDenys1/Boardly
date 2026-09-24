// Game Engine Types
export interface Player {
  id: string;
  name: string;
  score?: number;
  isActive?: boolean;
}

export interface Move {
  playerId: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface GameState<TGameData = unknown> {
  id: string;
  gameType: string;
  players: Player[];
  currentPlayerIndex: number;
  status: 'waiting' | 'playing' | 'finished';
  winner?: string;
  data: TGameData; // Game-specific state
  lastMoveAt?: number; // Timestamp of the last accepted move – drop-off detection (#815)
  // When the seat that is on the clock started its turn. Kept apart from
  // lastMoveAt because a move that does not hand the turn over must not buy the
  // player another full turn timer (#998). Absent on states written before that,
  // so every reader falls back to lastMoveAt.
  turnStartedAt?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** The instant the current seat's clock started, for states that predate `turnStartedAt`. */
export function resolveTurnStartedAt(state: {
  turnStartedAt?: unknown
  lastMoveAt?: unknown
} | null | undefined): number | null {
  const turnStartedAt = state?.turnStartedAt
  if (typeof turnStartedAt === 'number' && Number.isFinite(turnStartedAt)) return turnStartedAt
  const lastMoveAt = state?.lastMoveAt
  if (typeof lastMoveAt === 'number' && Number.isFinite(lastMoveAt)) return lastMoveAt
  return null
}

/** Where a seat's clock stood before a move, for GameEngine.holdTurnClock (#1007). */
export interface TurnClockSnapshot {
  currentPlayerIndex: number
  turnStartedAtMs: number | null
}

export interface RestorableGameState<TGameData = unknown> extends GameState<TGameData> {
  config?: GameConfig;
}

export interface GameConfig {
  maxPlayers: number;
  minPlayers: number;
  timeLimit?: number; // in minutes
  rules?: Record<string, unknown>;
}

export interface HasRollsLeft {
  getRollsLeft(): number
}

export interface HasScorecard {
  getScorecard(playerId: string): unknown
}

export interface PendingRequest {
  type: 'undo' | 'draw'
  requesterId: string
  responderId: string
}

export interface HasPendingRequest {
  getPendingRequest(): PendingRequest | null
  isTheoreticalDraw(): boolean
}

export function hasRollsLeft(engine: GameEngine): engine is GameEngine & HasRollsLeft {
  return typeof (engine as { getRollsLeft?: unknown }).getRollsLeft === 'function'
}

export function hasScorecard(engine: GameEngine): engine is GameEngine & HasScorecard {
  return typeof (engine as { getScorecard?: unknown }).getScorecard === 'function'
}

/**
 * Engines with a move only the turn timer may send - Ludo's `timeout`, which plays
 * the turn for an idle player (#1102). The state route refuses such a move unless
 * it arrives as a turn-timeout auto-action, whose deadline the route checks itself.
 */
export interface HasTimerOnlyMoves {
  isTimerOnlyMove(move: Move): boolean
}

export function isTimerOnlyMove(engine: GameEngine, move: Move): boolean {
  const candidate = engine as Partial<HasTimerOnlyMoves>
  return typeof candidate.isTimerOnlyMove === 'function' && candidate.isTimerOnlyMove(move) === true
}

export function hasPendingRequest(engine: GameEngine): engine is GameEngine & HasPendingRequest {
  return typeof (engine as { getPendingRequest?: unknown }).getPendingRequest === 'function'
}

function cloneDeep<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneDeep(item)) as T;
  }

  const cloned: Record<string, unknown> = {};
  for (const [key, itemValue] of Object.entries(value as Record<string, unknown>)) {
    cloned[key] = cloneDeep(itemValue);
  }

  return cloned as T;
}

/**
 * Abstract Game Engine - Base class for all game implementations
 * Handles common game logic: player management, turn system, move validation
 * 
 * @abstract
 * @example
 * class MyGame extends GameEngine {
 *   validateMove(move: Move): boolean { ... }
 *   processMove(move: Move): void { ... }
 *   getInitialGameData(): MyGameData { ... }
 * }
 */
export abstract class GameEngine {
  protected state: GameState;
  protected config: GameConfig;

  /**
   * Initialize a new game instance
   * @param gameId - Unique identifier for the game
   * @param gameType - Type of game (yahtzee, chess, etc.)
   * @param config - Game configuration (max players, time limits, etc.)
   */
  constructor(gameId: string, gameType: string, config: GameConfig) {
    this.config = config;
    this.state = {
      id: gameId,
      gameType,
      players: [],
      currentPlayerIndex: 0,
      status: 'waiting',
      data: this.getInitialGameData(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Abstract methods to be implemented by specific games
  abstract getInitialGameData(): unknown;
  abstract validateMove(move: Move): boolean;
  abstract processMove(move: Move): void;
  abstract checkWinCondition(): Player | null;
  abstract getGameRules(): string[];

  // Common methods
  addPlayer(player: Player): boolean {
    if (this.state.players.length >= this.config.maxPlayers) {
      return false;
    }
    this.state.players.push(player);
    this.state.updatedAt = new Date();
    return true;
  }

  removePlayer(playerId: string): boolean {
    if (this.state.status === 'playing') {
      return false;
    }

    const index = this.state.players.findIndex(p => p.id === playerId);
    if (index === -1) return false;

    this.state.players.splice(index, 1);
    // Adjust current player index if necessary
    if (this.state.currentPlayerIndex >= this.state.players.length) {
      this.state.currentPlayerIndex = 0;
    }
    this.state.updatedAt = new Date();
    return true;
  }

  shufflePlayers(): void {
    // Fisher-Yates shuffle algorithm
    for (let i = this.state.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.state.players[i], this.state.players[j]] = [this.state.players[j], this.state.players[i]];
    }
    this.state.updatedAt = new Date();
  }

  startGame(): boolean {
    if (this.state.players.length < this.config.minPlayers) {
      return false;
    }
    this.state.status = 'playing';
    this.state.updatedAt = new Date();
    this.state.lastMoveAt = Date.now();
    this.state.turnStartedAt = this.state.lastMoveAt;
    return true;
  }

  makeMove(move: Move): boolean {
    if (this.state.status !== 'playing' && !this.canProcessMoveWhenNotPlaying(move)) {
      return false;
    }

    if (!this.validateMove(move)) {
      return false;
    }

    this.processMove(move);
    this.state.updatedAt = new Date();
    // Every accepted move counts as activity, not only one that hands the turn
    // over. advanceTurnIndex() used to be the sole writer, so games that do not
    // rotate a turn index per action — guess the spy, alias — never advanced
    // lastMoveAt at all and their drop-off could not be located (#815).
    this.state.lastMoveAt = Date.now();
    if (this.restartsTurnClock(move)) {
      this.state.turnStartedAt = this.state.lastMoveAt;
    }

    // Check for winner
    const winner = this.checkWinCondition();
    if (winner) {
      this.state.status = 'finished';
      this.state.winner = winner.id;
    } else {
      // Move to next player (only if this type of move should advance turn)
      if (this.shouldAdvanceTurn(move)) {
        this.advanceTurnIndex();
      }
    }

    return true;
  }

  /**
   * Put the seat's clock back where it stood before a timeout auto-action (#1007).
   *
   * makeMove stamps turnStartedAt on every accepted move, and an auto-action is
   * a move like any other - so Yahtzee's auto-roll reset the very deadline the
   * auto-score that follows it milliseconds later is measured against. The
   * score came back 409 TURN_TIMER_ACTIVE, the client read that as "the turn
   * already ended", and an abandoned turn took two full timers to end.
   *
   * The timeout firing is not the player acting, so it may not buy that seat
   * another clock. When the auto-action did hand the turn on, the new seat's
   * clock is the one that counts and this leaves it alone.
   */
  holdTurnClock(previous: TurnClockSnapshot): void {
    if (previous.turnStartedAtMs === null) return;
    if (this.state.currentPlayerIndex !== previous.currentPlayerIndex) return;
    this.state.turnStartedAt = previous.turnStartedAtMs;
  }

  // Override this in subclasses to control when turn advances
  protected shouldAdvanceTurn(move: Move): boolean {
    // By default, advance turn after every move
    return true;
  }

  // Override in games that have moves which are not a turn – a draw or undo
  // prompt, say. Anything that answers `false` leaves the current seat's clock
  // where it was, so the player on it cannot top it up at will (#998).
  protected restartsTurnClock(_move: Move): boolean {
    return true;
  }

  // Override in rare cases where a move must be allowed outside "playing" status.
  // Default remains deny-by-default for defense in depth.
  protected canProcessMoveWhenNotPlaying(_move: Move): boolean {
    return false;
  }

  protected advanceTurnIndex(): void {
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
    this.state.lastMoveAt = Date.now();
    this.state.turnStartedAt = this.state.lastMoveAt;
  }

  handlePlayerLeave(playerId: string): boolean {
    const wasCurrentPlayer = this.state.players[this.state.currentPlayerIndex]?.id === playerId
    if (wasCurrentPlayer) {
      this.advanceTurnIndex()
      return true
    }
    return false
  }

  getState(): RestorableGameState {
    return {
      ...this.state,
      config: cloneDeep(this.config),
    };
  }

  getCurrentPlayer(): Player | null {
    return this.state.players[this.state.currentPlayerIndex] || null;
  }

  getPlayers(): Player[] {
    if (!Array.isArray(this.state.players)) {
      this.state.players = [];
    }
    return this.state.players.map((p) => ({ ...p }));
  }

  isGameFinished(): boolean {
    return this.state.status === 'finished';
  }

  getConfig(): GameConfig {
    return { ...this.config }
  }

  // Method to restore state from saved data
  restoreState(savedState: RestorableGameState): void {
    if (savedState && typeof savedState === 'object') {
      const { config, ...stateWithoutConfig } = savedState;
      this.state = {
        ...cloneDeep(stateWithoutConfig),
        players: Array.isArray(savedState.players)
          ? cloneDeep(savedState.players)
          : [],
      };

      if (config && typeof config === 'object') {
        this.config = cloneDeep(config);
      }

      this.normalizeRestoredData();
    }
  }

  // Override in subclasses that need to normalize deserialized game data (e.g. ensure arrays exist).
  protected normalizeRestoredData(): void {}

  // For 2-player games: find the other player's id. Was reimplemented
  // identically in connect-four and tic-tac-toe as `resolveResponderId`.
  protected getOpponent(playerId: string): string | null {
    const opponent = this.state.players.find((player) => player.id !== playerId);
    return opponent?.id ?? null;
  }

  // Resolves a stored winnerId to the matching Player, or null if unset/not found.
  // Was reimplemented identically in checkWinCondition() across 5 engines
  // (memory, liars-party, telephone-doodle, sketch-and-guess, fake-artist).
  protected resolvePlayerWinner(winnerId: string | null | undefined): Player | null {
    if (!winnerId) return null;
    return this.state.players.find((player) => player.id === winnerId) || null;
  }
}
