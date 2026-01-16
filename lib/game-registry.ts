/**
 * Game Registry - Centralized game registration system
 * 
 * Allows easy addition of new games without changing core code.
 * All games are registered here, and the system automatically picks them up.
 */

import { GameEngine, GameConfig } from './game-engine'
import { YahtzeeGame } from './games/yahtzee-game'
import { SpyGame } from './games/spy-game'

export interface GameMetadata {
  id: string
  name: string
  emoji: string
  description: string
  minPlayers: number
  maxPlayers: number
  defaultMaxPlayers: number
  difficulty: 'easy' | 'medium' | 'hard'
  estimatedDuration: number // in minutes
  supportsBots: boolean
  category: 'dice' | 'card' | 'board' | 'social' | 'strategy'
  allowedPlayers?: number[] // Specific allowed values (e.g., [2, 3, 4])
}

export interface GameFactory {
  createEngine(gameId: string, config: GameConfig): GameEngine
  createInitialState(): any
}

// Type for React component (imported only when used on client)
type GameComponent = React.ComponentType<any>

export interface GameRegistration {
  metadata: GameMetadata
  factory: GameFactory
  component?: GameComponent
}

/**
 * Central registry for all games in the system
 */
export class GameRegistry {
  private static games = new Map<string, GameRegistration>()

  /**
   * Registers a new game in the system
   */
  static register(
    id: string,
    metadata: GameMetadata,
    factory: GameFactory,
    component?: GameComponent
  ): void {
    if (this.games.has(id)) {
      console.warn(`Game ${id} is already registered. Overwriting...`)
    }
    
    this.games.set(id, { metadata, factory, component })
  }

  /**
   * Gets game registration by ID
   */
  static get(id: string): GameRegistration | undefined {
    return this.games.get(id)
  }

  /**
   * Gets game metadata
   */
  static getMetadata(id: string): GameMetadata | undefined {
    return this.games.get(id)?.metadata
  }

  /**
   * Gets all registered games
   */
  static getAll(): GameRegistration[] {
    return Array.from(this.games.values())
  }

  /**
   * Gets only metadata for all games
   */
  static getAllMetadata(): GameMetadata[] {
    return Array.from(this.games.values()).map(g => g.metadata)
  }

  /**
   * Gets only games with implemented UI
   */
  static getAvailableGames(): GameMetadata[] {
    return Array.from(this.games.values())
      .filter(g => g.component !== undefined)
      .map(g => g.metadata)
  }

  /**
   * Creates a game engine instance
   */
  static createEngine(gameId: string, gameType: string, config: GameConfig): GameEngine {
    const game = this.games.get(gameType)
    if (!game) {
      throw new Error(`Game type "${gameType}" is not registered`)
    }
    return game.factory.createEngine(gameId, config)
  }

  /**
   * Checks if a game is registered
   */
  static has(id: string): boolean {
    return this.games.has(id)
  }

  /**
   * Gets UI component for a game
   */
  static getComponent(id: string): GameComponent | undefined {
    return this.games.get(id)?.component
  }
}

// ============================================
// GAME REGISTRATIONS
// ============================================

// Yahtzee
GameRegistry.register(
  'yahtzee',
  {
    id: 'yahtzee',
    name: 'Yahtzee',
    emoji: '🎲',
    description: 'Roll five dice, score combos, and race friends to the highest total.',
    minPlayers: 1,
    maxPlayers: 4,
    defaultMaxPlayers: 4,
    allowedPlayers: [2, 3, 4],
    difficulty: 'medium',
    estimatedDuration: 20,
    supportsBots: true,
    category: 'dice',
  },
  {
    createEngine: (gameId: string, config: GameConfig) => {
      return new YahtzeeGame(gameId, config)
    },
    createInitialState: () => ({
      round: 0,
      currentPlayerIndex: 0,
      dice: [1, 1, 1, 1, 1],
      held: [false, false, false, false, false],
      rollsLeft: 3,
      scores: [],
      finished: false,
    }),
  }
  // component will be added later when we create GameRouter
)

// Guess the Spy
GameRegistry.register(
  'guess_the_spy',
  {
    id: 'guess_the_spy',
    name: 'Guess the Spy',
    emoji: '🕵️',
    description: 'Find the spy among you! Most players know the location, but one is the spy. Can you spot them before time runs out?',
    minPlayers: 3,
    maxPlayers: 10,
    defaultMaxPlayers: 6,
    allowedPlayers: [3, 4, 5, 6, 7, 8],
    difficulty: 'easy',
    estimatedDuration: 10,
    supportsBots: false,
    category: 'social',
  },
  {
    createEngine: (gameId: string, config: GameConfig) => {
      return new SpyGame(gameId)
    },
    createInitialState: () => ({
      gameType: 'guess_the_spy',
      players: [],
      status: 'waiting',
      currentRound: 0,
      spyIndex: null,
      location: null,
      categories: [],
      votes: {},
    }),
  }
  // component will be added later
)

// Example: Chess (not yet implemented, but already registered)
GameRegistry.register(
  'chess',
  {
    id: 'chess',
    name: 'Chess',
    emoji: '♟️',
    description: 'Classic strategy game for two players.',
    minPlayers: 2,
    maxPlayers: 2,
    defaultMaxPlayers: 2,
    allowedPlayers: [2],
    difficulty: 'hard',
    estimatedDuration: 30,
    supportsBots: true,
    category: 'strategy',
  },
  {
    createEngine: (gameId: string, config: GameConfig) => {
      throw new Error('Chess engine not yet implemented')
    },
    createInitialState: () => ({
      board: [],
      currentPlayer: 'white',
      moves: [],
    }),
  }
)

// Example: Uno (not yet implemented, but already registered)
GameRegistry.register(
  'uno',
  {
    id: 'uno',
    name: 'Uno',
    emoji: '🃏',
    description: 'Match colors and numbers in this fast-paced card game.',
    minPlayers: 2,
    maxPlayers: 10,
    defaultMaxPlayers: 4,
    allowedPlayers: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    difficulty: 'easy',
    estimatedDuration: 15,
    supportsBots: true,
    category: 'card',
  },
  {
    createEngine: (gameId: string, config: GameConfig) => {
      throw new Error('Uno engine not yet implemented')
    },
    createInitialState: () => ({
      deck: [],
      discardPile: [],
      currentPlayer: 0,
      direction: 1,
    }),
  }
)
