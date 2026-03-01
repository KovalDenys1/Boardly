/**
 * Game Registry — central factory for creating game engines and querying game metadata.
 *
 * Every new game must be registered here.  The rest of the codebase uses
 * `createGameEngine()` / `getGameMetadata()` instead of importing concrete
 * game classes directly, keeping shared code game-agnostic.
 */

import { GameEngine, GameConfig } from './game-engine'
import { YahtzeeGame } from './games/yahtzee-game'
import { TicTacToeGame } from './games/tic-tac-toe-game'
import { RockPaperScissorsGame } from './games/rock-paper-scissors-game'
import { SpyGame } from './games/spy-game'
import { MemoryGame } from './games/memory-game'
import { TelephoneDoodleGame } from './games/telephone-doodle-game'
import { SketchAndGuessGame } from './games/sketch-and-guess-game'
import { LiarsPartyGame } from './games/liars-party-game'
import {
  isLiarsPartyEnabled,
  isSketchAndGuessEnabled,
  isTelephoneDoodleEnabled,
} from './feature-flags'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegisteredGameType =
  | 'yahtzee'
  | 'guess_the_spy'
  | 'tic_tac_toe'
  | 'rock_paper_scissors'
  | 'memory'
export type ExperimentalGameType = 'telephone_doodle' | 'sketch_and_guess' | 'liars_party'
export type SupportedGameType = RegisteredGameType | ExperimentalGameType

/** Fallback game type used when DB value is null (legacy lobbies). */
export const DEFAULT_GAME_TYPE: RegisteredGameType = 'yahtzee'

export interface GameMetadata {
  type: SupportedGameType
  name: string
  icon: string
  minPlayers: number
  maxPlayers: number
  supportsBots: boolean
  /** Translation namespace for this game, e.g. 'yahtzee', 'tictactoe' */
  translationKey: string
}

interface GameRegistryEntry {
  metadata: GameMetadata
  /** Factory that builds a fresh engine (new game). Caller must still addPlayer/startGame. */
  create: (gameId: string, config?: Partial<GameConfig>) => GameEngine
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<RegisteredGameType, GameRegistryEntry> = {
  yahtzee: {
    metadata: {
      type: 'yahtzee',
      name: 'Yahtzee',
      icon: '🎲',
      minPlayers: 1,
      maxPlayers: 4,
      supportsBots: true,
      translationKey: 'yahtzee',
    },
    create: (id, cfg) =>
      new YahtzeeGame(id, { maxPlayers: 4, minPlayers: 1, ...cfg }),
  },

  guess_the_spy: {
    metadata: {
      type: 'guess_the_spy',
      name: 'Guess the Spy',
      icon: '🕵️',
      minPlayers: 3,
      maxPlayers: 10,
      supportsBots: false,
      translationKey: 'spy',
    },
    create: (id, _cfg) => new SpyGame(id),
  },

  tic_tac_toe: {
    metadata: {
      type: 'tic_tac_toe',
      name: 'Tic Tac Toe',
      icon: '❌⭕',
      minPlayers: 2,
      maxPlayers: 2,
      supportsBots: true,
      translationKey: 'tictactoe',
    },
    create: (id, cfg) =>
      new TicTacToeGame(id, { maxPlayers: 2, minPlayers: 2, ...cfg }),
  },

  rock_paper_scissors: {
    metadata: {
      type: 'rock_paper_scissors',
      name: 'Rock Paper Scissors',
      icon: '✊✋✌️',
      minPlayers: 2,
      maxPlayers: 2,
      supportsBots: true,
      translationKey: 'rps',
    },
    create: (id, cfg) =>
      new RockPaperScissorsGame(id, { maxPlayers: 2, minPlayers: 2, ...cfg }),
  },

  memory: {
    metadata: {
      type: 'memory',
      name: 'Memory',
      icon: '🧠',
      minPlayers: 2,
      maxPlayers: 4,
      supportsBots: false,
      translationKey: 'memory',
    },
    create: (id, cfg) =>
      new MemoryGame(id, { maxPlayers: 4, minPlayers: 2, ...cfg }),
  },
}

const TELEPHONE_DOODLE_ENTRY: GameRegistryEntry = {
  metadata: {
    type: 'telephone_doodle',
    name: 'Telephone Doodle',
    icon: '📞',
    minPlayers: 3,
    maxPlayers: 12,
    supportsBots: false,
    translationKey: 'telephone_doodle',
  },
  create: (id, cfg) =>
    new TelephoneDoodleGame(id, { maxPlayers: 12, minPlayers: 3, ...cfg }),
}

const SKETCH_AND_GUESS_ENTRY: GameRegistryEntry = {
  metadata: {
    type: 'sketch_and_guess',
    name: 'Sketch & Guess',
    icon: '🎨',
    minPlayers: 3,
    maxPlayers: 10,
    supportsBots: false,
    translationKey: 'guess_my_drawing',
  },
  create: (id, cfg) =>
    new SketchAndGuessGame(id, { maxPlayers: 10, minPlayers: 3, ...cfg }),
}

const LIARS_PARTY_ENTRY: GameRegistryEntry = {
  metadata: {
    type: 'liars_party',
    name: "Liar's Party",
    icon: '🎭',
    minPlayers: 4,
    maxPlayers: 12,
    supportsBots: false,
    translationKey: 'liars_party',
  },
  create: (id, cfg) =>
    new LiarsPartyGame(id, { maxPlayers: 12, minPlayers: 4, ...cfg }),
}

function getRegistryEntry(gameType: string): GameRegistryEntry | undefined {
  const stableEntry = REGISTRY[gameType as RegisteredGameType]
  if (stableEntry) {
    return stableEntry
  }

  if (gameType === 'telephone_doodle' && isTelephoneDoodleEnabled()) {
    return TELEPHONE_DOODLE_ENTRY
  }

  if (gameType === 'sketch_and_guess' && isSketchAndGuessEnabled()) {
    return SKETCH_AND_GUESS_ENTRY
  }

  if (gameType === 'liars_party' && isLiarsPartyEnabled()) {
    return LIARS_PARTY_ENTRY
  }

  return undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a game engine instance for the given game type and id.
 * Throws if the type is unknown.
 */
export function createGameEngine(
  gameType: string,
  gameId: string,
  config?: Partial<GameConfig>,
): GameEngine {
  const entry = getRegistryEntry(gameType)
  if (!entry) {
    throw new Error(`Unknown game type: "${gameType}"`)
  }
  return entry.create(gameId, config)
}

/**
 * Create a game engine and immediately restore saved state from the DB.
 */
export function restoreGameEngine(
  gameType: string,
  gameId: string,
  savedState: any,
): GameEngine {
  const engine = createGameEngine(gameType, gameId)
  engine.restoreState(savedState)
  return engine
}

/**
 * Return metadata for a specific game type. Throws if unknown.
 */
export function getGameMetadata(gameType: string): GameMetadata {
  const entry = getRegistryEntry(gameType)
  if (!entry) {
    throw new Error(`Unknown game type: "${gameType}"`)
  }
  return entry.metadata
}

/**
 * List all registered game types.
 */
export function getSupportedGameTypes(): SupportedGameType[] {
  const stableTypes = Object.keys(REGISTRY) as RegisteredGameType[]
  const experimentalTypes: SupportedGameType[] = []

  if (isTelephoneDoodleEnabled()) {
    experimentalTypes.push('telephone_doodle')
  }
  if (isSketchAndGuessEnabled()) {
    experimentalTypes.push('sketch_and_guess')
  }
  if (isLiarsPartyEnabled()) {
    experimentalTypes.push('liars_party')
  }

  return [...stableTypes, ...experimentalTypes]
}

/**
 * Check whether a game type supports bot players.
 */
export function hasBotSupport(gameType: string): boolean {
  const entry = getRegistryEntry(gameType)
  return entry?.metadata.supportsBots ?? false
}

/**
 * Type-guard: is the string a known registered game type?
 */
export function isRegisteredGameType(value: string): value is RegisteredGameType {
  return value in REGISTRY
}

export function isSupportedGameType(value: string): value is SupportedGameType {
  return (
    isRegisteredGameType(value) ||
    (value === 'telephone_doodle' && isTelephoneDoodleEnabled()) ||
    (value === 'sketch_and_guess' && isSketchAndGuessEnabled()) ||
    (value === 'liars_party' && isLiarsPartyEnabled())
  )
}
