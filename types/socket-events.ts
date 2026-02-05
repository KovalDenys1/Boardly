// ============================================================================
// Socket Event Definitions - Centralized Type-Safe Event System
// ============================================================================
// Version: 1.0.0
// Last Updated: February 3, 2026
//
// This file defines all WebSocket events used in Boardly.
// - Prevents typos with const enum
// - Enforces type safety with TypeScript
// - Documents event payloads and flows
// - Supports future versioning and extensions
// ============================================================================

/**
 * Socket Event Names - Use these constants instead of raw strings
 * 
 * Usage:
 *   socket.emit(SocketEvents.JOIN_LOBBY, { lobbyCode: 'ABC123' })
 *   socket.on(SocketEvents.GAME_UPDATE, (data: GameUpdatePayload) => {...})
 */
export const SocketEvents = {
  // ========================================
  // Connection Lifecycle Events
  // ========================================
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  RECONNECT_ATTEMPT: 'reconnect_attempt',
  RECONNECT_FAILED: 'reconnect_failed',
  
  // ========================================
  // Error Events
  // ========================================
  ERROR: 'error', // Generic socket error
  SERVER_ERROR: 'server-error', // Structured error from server
  
  // ========================================
  // Lobby Room Management (Client → Server)
  // ========================================
  JOIN_LOBBY: 'join-lobby', // Join a specific lobby room
  LEAVE_LOBBY: 'leave-lobby', // Leave a lobby room
  
  // ========================================
  // Lobby List Management (Client → Server)
  // ========================================
  JOIN_LOBBY_LIST: 'join-lobby-list', // Subscribe to lobby list updates
  LEAVE_LOBBY_LIST: 'leave-lobby-list', // Unsubscribe from lobby list
  
  // ========================================
  // Lobby Updates (Server → Client)
  // ========================================
  LOBBY_UPDATE: 'lobby-update', // Generic lobby state change
  LOBBY_CREATED: 'lobby-created', // New lobby created (triggers list refresh)
  LOBBY_LIST_UPDATE: 'lobby-list-update', // Lobby list changed (trigger refetch)
  
  // ========================================
  // Player Events (Bidirectional)
  // ========================================
  PLAYER_JOINED: 'player-joined', // Player joined lobby (Server → Client)
  PLAYER_LEFT: 'player-left', // Player left lobby (Server → Client)
  PLAYER_READY: 'player-ready', // Player marked ready (future)
  PLAYER_TYPING: 'player-typing', // Chat typing indicator
  
  // ========================================
  // Game Lifecycle Events
  // ========================================
  GAME_STARTED: 'game-started', // Game started (Server → Client)
  GAME_UPDATE: 'game-update', // Game state changed (Server → Client)
  GAME_ACTION: 'game-action', // Player action (Client → Server)
  GAME_ABANDONED: 'game-abandoned', // Game was abandoned (Server → Client)
  GAME_ENDED: 'game-ended', // Game finished normally (future)
  
  // ========================================
  // Chat Events
  // ========================================
  SEND_CHAT_MESSAGE: 'send-chat-message', // Client → Server
  CHAT_MESSAGE: 'chat-message', // Server → Client (broadcast)
  
  // ========================================
  // Bot Events
  // ========================================
  BOT_ACTION: 'bot-action', // Bot performed action (Server → Client)
  
  // ========================================
  // Friend System Events (future)
  // ========================================
  FRIEND_REQUEST: 'friend-request',
  FRIEND_ACCEPTED: 'friend-accepted',
  USER_ONLINE: 'user-online',
  USER_OFFLINE: 'user-offline',
  ONLINE_USERS: 'online-users',
  
  // ========================================
  // Spectator Events (future)
  // ========================================
  SPECTATOR_JOINED: 'spectator-joined',
  SPECTATOR_LEFT: 'spectator-left',
  
  // ========================================
  // Lobby Settings Events (future)
  // ========================================
  LOBBY_SETTINGS_UPDATE: 'lobby-settings-update',
} as const

export type SocketEventName = typeof SocketEvents[keyof typeof SocketEvents]

// ============================================================================
// Base Event Structure
// ============================================================================

/**
 * Base interface for all events with metadata
 * Enables event tracking, deduplication, and ordering
 */
export interface BaseEventPayload {
  /** Incrementing sequence number (prevents out-of-order processing) */
  sequenceId?: number
  /** Unix timestamp in milliseconds */
  timestamp?: number
  /** Event version (for schema evolution) */
  version?: string
  /** Correlation ID for tracing (links related events) */
  correlationId?: string
}

// ============================================================================
// Lobby Event Payloads
// ============================================================================

export interface JoinLobbyPayload {
  lobbyCode: string
}

export interface LeaveLobbyPayload {
  lobbyCode: string
}

export interface LobbyUpdatePayload extends BaseEventPayload {
  lobbyCode: string
  /** Type of update that occurred */
  type: 'player-joined' | 'player-left' | 'settings-changed' | 'state-refresh'
  /** Additional data specific to the update type */
  data?: unknown
}

export interface LobbyCreatedPayload {
  lobbyCode: string
  createdBy: string
}

// ============================================================================
// Player Event Payloads
// ============================================================================

export interface PlayerJoinedPayload extends BaseEventPayload {
  lobbyCode: string
  userId: string
  username: string
  isBot?: boolean
}

export interface PlayerLeftPayload extends BaseEventPayload {
  lobbyCode: string
  userId: string
  username: string
  reason?: 'manual' | 'timeout' | 'kicked' | 'error'
}

export interface PlayerReadyPayload extends BaseEventPayload {
  lobbyCode: string
  userId: string
  isReady: boolean
}

export interface PlayerTypingPayload {
  lobbyCode: string
  userId: string
  username: string
}

// ============================================================================
// Game Event Payloads
// ============================================================================

export interface GameStartedPayload extends BaseEventPayload {
  lobbyCode: string
  gameId: string
  gameType: string
  players: Array<{
    userId: string
    username: string
    isBot: boolean
  }>
  /** Initial game state (optional, client can fetch separately) */
  initialState?: unknown
  /** Legacy game object for backward compatibility */
  game?: unknown
  /** First player name for UI notifications */
  firstPlayerName?: string
}

export interface GameUpdatePayload extends BaseEventPayload {
  lobbyCode: string
  gameId: string
  /** Action that triggered the update */
  action: 'state-change' | 'turn-changed' | 'player-left' | 'game-abandoned' | 'chat-message'
  /** Game-specific data */
  payload: unknown
}

export interface GameActionPayload {
  lobbyCode: string
  gameId?: string
  /** Action type (validated on server) */
  action: 'state-change' | 'player-left' | 'player-joined' | 'chat-message' | 'game-abandoned'
  /** Action-specific data */
  payload: unknown
}

export interface GameAbandonedPayload extends BaseEventPayload {
  lobbyCode: string
  gameId: string
  reason: string
  abandonedBy?: string
}

export interface GameEndedPayload extends BaseEventPayload {
  lobbyCode: string
  gameId: string
  /** Winning player(s) */
  winners: string[]
  /** Final scores */
  scores: Record<string, number>
}

// ============================================================================
// Chat Event Payloads
// ============================================================================

export interface SendChatMessagePayload {
  lobbyCode: string
  message: string
  userId: string
  username: string
}

export interface ChatMessagePayload extends BaseEventPayload {
  id: string
  lobbyCode: string
  userId: string
  username: string
  message: string
  /** Message type for special messages */
  type?: 'system' | 'user' | 'bot'
}

// ============================================================================
// Bot Event Payloads
// ============================================================================

export interface BotActionPayload extends BaseEventPayload {
  lobbyCode: string
  gameId: string
  botId: string
  botName: string
  /** Type of action (roll, score, etc.) */
  actionType: string
  /** Action details */
  action: unknown
}

// ============================================================================
// Error Event Payloads
// ============================================================================

export interface ServerErrorPayload {
  /** Error code (e.g., 'LOBBY_NOT_FOUND', 'INVALID_MOVE') */
  code: string
  /** Human-readable error message (English) */
  message: string
  /** Translation key for i18n */
  translationKey?: string
  /** Additional context */
  details?: Record<string, unknown>
  /** Stack trace (only in development) */
  stack?: string
}

// ============================================================================
// Friend System Event Payloads (future)
// ============================================================================

export interface UserOnlinePayload {
  userId: string
  username: string
}

export interface UserOfflinePayload {
  userId: string
}

export interface OnlineUsersPayload {
  userIds: string[]
}

// ============================================================================
// Spectator Event Payloads (future)
// ============================================================================

export interface SpectatorJoinedPayload extends BaseEventPayload {
  lobbyCode: string
  userId: string
  username: string
}

export interface SpectatorLeftPayload extends BaseEventPayload {
  lobbyCode: string
  userId: string
}

// ============================================================================
// Lobby Settings Event Payloads (future)
// ============================================================================

export interface LobbySettingsUpdatePayload extends BaseEventPayload {
  lobbyCode: string
  settings: {
    maxPlayers?: number
    isPrivate?: boolean
    allowSpectators?: boolean
    turnTimeLimit?: number
    [key: string]: unknown
  }
  changedBy: string
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if event has sequence ID
 */
export function hasSequenceId(event: unknown): event is BaseEventPayload & { sequenceId: number } {
  return typeof event === 'object' && event !== null && 'sequenceId' in event && typeof (event as any).sequenceId === 'number'
}

/**
 * Type guard for error payload
 */
export function isServerError(event: unknown): event is ServerErrorPayload {
  return typeof event === 'object' && event !== null && 'code' in event && 'message' in event
}

// ============================================================================
// Event Validation
// ============================================================================

/**
 * Validates that an event has required fields
 */
export function validateEvent<T extends BaseEventPayload>(
  event: unknown,
  requiredFields: (keyof T)[]
): event is T {
  if (typeof event !== 'object' || event === null) {
    return false
  }
  
  return requiredFields.every(field => field in event)
}

// ============================================================================
// Event Helpers
// ============================================================================

/**
 * Creates an event payload with metadata
 */
export function createEventPayload<T extends BaseEventPayload>(
  data: Omit<T, keyof BaseEventPayload>,
  options?: {
    includeSequence?: boolean
    version?: string
    correlationId?: string
  }
): T {
  return {
    ...data,
    timestamp: Date.now(),
    version: options?.version || '1.0.0',
    correlationId: options?.correlationId,
  } as T
}

/**
 * Extracts correlation ID from event (for tracing)
 */
export function getCorrelationId(event: BaseEventPayload): string | undefined {
  return event.correlationId
}

// ============================================================================
// Room Names (Standardized)
// ============================================================================

/**
 * Helper functions to generate consistent room names
 */
export const SocketRooms = {
  /** Room for a specific lobby (e.g., "lobby:ABC123") */
  lobby: (lobbyCode: string) => `lobby:${lobbyCode}`,
  
  /** Room for lobby list subscribers */
  lobbyList: () => 'lobby-list',
  
  /** Room for a specific game (future) */
  game: (gameId: string) => `game:${gameId}`,
  
  /** Room for spectators of a game (future) */
  spectators: (gameId: string) => `spectators:${gameId}`,
  
  /** Room for user's friends (future) */
  userFriends: (userId: string) => `friends:${userId}`,
}

// ============================================================================
// Event Documentation
// ============================================================================

/**
 * Event Flow Documentation
 * 
 * JOIN LOBBY FLOW:
 * 1. Client → Server: JOIN_LOBBY { lobbyCode }
 * 2. Server validates lobby exists
 * 3. Server: socket.join(SocketRooms.lobby(lobbyCode))
 * 4. Server → All in lobby: PLAYER_JOINED { userId, username }
 * 5. Server → Lobby list: LOBBY_LIST_UPDATE (if player count changed)
 * 
 * GAME ACTION FLOW:
 * 1. Client → API: POST /api/game/[gameId]/action { action, data }
 * 2. API validates and updates DB
 * 3. API → Socket Server: POST /api/notify { room, event: GAME_UPDATE, data }
 * 4. Socket Server → All in room: GAME_UPDATE { action, payload }
 * 
 * CHAT MESSAGE FLOW:
 * 1. Client → Server: SEND_CHAT_MESSAGE { lobbyCode, message }
 * 2. Server validates rate limit
 * 3. Server → All in lobby: CHAT_MESSAGE { id, userId, message, timestamp }
 * 
 * RECONNECTION FLOW:
 * 1. Client reconnects (socket.io handles automatically)
 * 2. Client → Server: JOIN_LOBBY { lobbyCode } (re-join room)
 * 3. Client → API: GET /api/lobby/[code] (fetch latest state)
 * 4. Client processes any missed events (future: event replay)
 */
