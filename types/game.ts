/**
 * Game-related TypeScript types
 * Shared across components and hooks
 *
 * NOTE: These types are game-agnostic. Game-specific types live in
 * their respective engine files (e.g. lib/games/yahtzee-game.ts).
 */

import { GameState } from '@/lib/game-engine'

/** Generic game state — use when the specific TGameData is irrelevant. */
export type AnyGameState = GameState<unknown>

// Player in game context (includes user info)
export interface GamePlayer {
  id: string
  name: string
  score: number
  userId: string
  bot?: {
    id: string
    userId: string
    botType: string
    difficulty: string
  } | null
  user?: {
    id: string
    username: string
    email?: string
    bot?: {
      id: string
      userId: string
      botType: string
      difficulty: string
    } | null
  }
}

// Full game object from database
export interface Game {
  id: string
  status: 'waiting' | 'playing' | 'finished'
  state: string // JSON string
  players: GamePlayer[]
  currentTurn: number
  createdAt: Date
  updatedAt: Date
}

// Socket event payloads
export interface GameUpdatePayload {
  action: string
  payload: AnyGameState | { state: AnyGameState } | Record<string, unknown>
  state?: AnyGameState
}

export interface PlayerJoinedPayload {
  username: string
  userId: string
}

export interface GameStartedPayload {
  lobbyCode: string
  gameId: string
  game?: Game
  firstPlayerName?: string
}

export interface LobbyUpdatePayload {
  lobbyCode: string
}

export interface ChatMessagePayload {
  id: string
  userId: string
  username: string
  message: string
  timestamp: number
  isBot?: boolean
}

export interface PlayerTypingPayload {
  userId: string
  username: string
}

// Lobby object shape (shared between hooks and pages)
export interface Lobby {
  id: string
  gameType: string
  isPrivate?: boolean
  maxPlayers?: number
  turnTimer?: number
  name?: string
  code?: string
  status?: string
  hostId?: string
  creatorId?: string
  allowSpectators?: boolean
  isActive?: boolean
  games?: Game[]
  creator?: { username?: string; email?: string }
  spectatorCount?: number
  [key: string]: unknown
}

// Bot move visualization (game-agnostic)
export interface BotMoveStep {
  type: 'roll' | 'hold' | 'score' | 'thinking'
  message: string
  data?: {
    dice?: number[]
    held?: number[]
    category?: string   // game-specific category key
    score?: number
    rollNumber?: number
  }
}
