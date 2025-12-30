/**
 * Game-related TypeScript types
 * Shared across components and hooks
 */

import { GameState } from '@/lib/game-engine'
import { YahtzeeGameData } from '@/lib/games/yahtzee-game'
import { YahtzeeCategory } from '@/lib/yahtzee'

// Type for Yahtzee game with specific data structure
export type YahtzeeGameState = GameState<YahtzeeGameData>

// Player in game context (includes user info)
export interface GamePlayer {
  id: string
  name: string
  score: number
  isBot: boolean
  userId: string
  user?: {
    id: string
    username: string
    isBot: boolean
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
  payload: YahtzeeGameState | { state: YahtzeeGameState } | Record<string, unknown>
  state?: YahtzeeGameState
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

// Bot move visualization
export interface BotMoveStep {
  type: 'roll' | 'hold' | 'score' | 'thinking'
  message: string
  data?: {
    dice?: number[]
    held?: number[]
    category?: YahtzeeCategory
    score?: number
    rollNumber?: number
  }
}
