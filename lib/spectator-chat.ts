/**
 * Spectator chat travels client to client on the spectator topic
 * (`buildSpectatorTopic`), so every message is a peer's claim, never the
 * server's. The topic now carries the lobby secret (audit S3-07), which keeps
 * outsiders off it; this keeps what the people on it can post to the shape
 * and size the chat box itself allows.
 */

export interface SpectatorChatMessage {
  id: string
  userId: string
  username: string
  lobbyCode: string
  message: string
  timestamp?: number
}

/** The chat box's own limit (spectate/page.tsx `maxLength`). */
export const MAX_SPECTATOR_CHAT_LENGTH = 500
const MAX_ID_LENGTH = 100
const MAX_USERNAME_LENGTH = 64

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
}

/** A received spectator chat message, or null if it is malformed or for another lobby. */
export function readSpectatorChatMessage(payload: unknown, lobbyCode: string): SpectatorChatMessage | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as Record<string, unknown>

  const id = boundedString(raw.id, MAX_ID_LENGTH)
  const userId = boundedString(raw.userId, MAX_ID_LENGTH)
  const username = boundedString(raw.username, MAX_USERNAME_LENGTH)
  const message = typeof raw.message === 'string' ? raw.message.trim() : ''
  if (!id || !userId || !username || !message || message.length > MAX_SPECTATOR_CHAT_LENGTH) return null
  if (raw.lobbyCode !== lobbyCode) return null

  const timestamp = typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp) ? raw.timestamp : undefined
  return { id, userId, username, lobbyCode, message, ...(timestamp !== undefined ? { timestamp } : {}) }
}
