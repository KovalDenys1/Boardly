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
  createdAt: Date;
  updatedAt: Date;
}

export interface GameConfig {
  maxPlayers: number;
  minPlayers: number;
  timeLimit?: number; // in minutes
  rules?: Record<string, any>;
}

// Abstract Game Engine
export abstract class GameEngine {
  protected state: GameState;
  protected config: GameConfig;

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
  abstract getInitialGameData(): any;
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
    return true;
  }

  makeMove(move: Move): boolean {
    if (!this.validateMove(move)) {
      return false;
    }

    this.processMove(move);
    this.state.updatedAt = new Date();

    // Check for winner
    const winner = this.checkWinCondition();
    if (winner) {
      this.state.status = 'finished';
      this.state.winner = winner.id;
    } else {
      // Move to next player (only if this type of move should advance turn)
      if (this.shouldAdvanceTurn(move)) {
        this.nextPlayer();
      }
    }

    return true;
  }

  // Override this in subclasses to control when turn advances
  protected shouldAdvanceTurn(move: Move): boolean {
    // By default, advance turn after every move
    return true;
  }

  private nextPlayer(): void {
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
  }

  getState(): GameState {
    return { ...this.state };
  }

  getCurrentPlayer(): Player | null {
    return this.state.players[this.state.currentPlayerIndex] || null;
  }

  getPlayers(): Player[] {
    // Ensure players is always an array
    if (!Array.isArray(this.state.players)) {
      this.state.players = [];
    }
    return [...this.state.players];
  }

  isGameFinished(): boolean {
    return this.state.status === 'finished';
  }

  getConfig(): GameConfig {
    return { ...this.config }
  }

  // Method to restore state from saved data
  restoreState(savedState: GameState): void {
    // Ensure players is an array when restoring state
    if (savedState && typeof savedState === 'object') {
      this.state = {
        ...savedState,
        players: Array.isArray(savedState.players) ? savedState.players : [],
      }
    }
  }
}