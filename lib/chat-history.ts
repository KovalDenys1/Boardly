/**
 * Redis-backed lobby chat history.
 * Stores the last 50 messages per lobby with a 24h TTL.
 * Degrades gracefully to no-op when Redis is unavailable.
 */

import { logger } from './logger'
import { CHAT_RETENTION_HOURS } from './retention-periods'
import { getRedisRestCredentials, REDIS_CREDENTIALS_MISSING_MESSAGE } from './redis-credentials'

const CHAT_KEY_PREFIX = 'chat:lobby:'
const MAX_MESSAGES = 50
const TTL_SECONDS = CHAT_RETENTION_HOURS * 60 * 60

interface ChatRedisClient {
  lpush(key: string, ...values: string[]): Promise<unknown>
  ltrim(key: string, start: number, stop: number): Promise<unknown>
  expire(key: string, seconds: number): Promise<unknown>
  // Not string[]: the Upstash REST client deserializes JSON on the way out, so
  // what comes back is whatever was stored — see parseStoredMessage below.
  lrange(key: string, start: number, stop: number): Promise<unknown[]>
}

interface UpstashRedisModule {
  Redis: new (config: { url: string; token: string }) => ChatRedisClient
}

let _client: ChatRedisClient | null | undefined = undefined
let _clientPromise: Promise<ChatRedisClient | null> | null = null

async function getChatRedisClient(): Promise<ChatRedisClient | null> {
  if (_client !== undefined) return _client

  const credentials = getRedisRestCredentials()

  if (!credentials) {
    // Say so. This used to return null in silence, which is how an empty chat
    // history looked exactly like a lobby where nobody had spoken (#852).
    logger.warn(`chat-history: ${REDIS_CREDENTIALS_MISSING_MESSAGE} History will be empty.`)
    _client = null
    return null
  }

  const { url, token } = credentials

  if (!_clientPromise) {
    _clientPromise = import('@upstash/redis')
      .then((mod) => {
        const RedisConstructor = (mod as UpstashRedisModule).Redis
        _client = new RedisConstructor({ url, token })
        return _client
      })
      .catch((err) => {
        logger.warn('chat-history: failed to init Redis client', {
          error: err instanceof Error ? err.message : String(err),
        })
        _client = null
        return null
      })
      .finally(() => {
        _clientPromise = null
      })
  }

  return _clientPromise
}

export interface StoredChatMessage {
  id: string
  userId: string
  username: string
  message: string
  lobbyCode: string
  timestamp?: number
}

function lobbyKey(lobbyCode: string): string {
  return `${CHAT_KEY_PREFIX}${lobbyCode}`
}

/**
 * Turn one stored entry back into a message.
 *
 * persistChatMessage writes a JSON string, but the Upstash REST client parses
 * JSON on the way out, so what lrange returns is already an object. Calling
 * JSON.parse on it throws, the entry was dropped, and every read returned an
 * empty list — which is to say chat history never worked, even when Redis was
 * connected (#854). Accept both shapes, because which one arrives depends on
 * the client, not on us.
 */
function parseStoredMessage(entry: unknown): StoredChatMessage | null {
  if (typeof entry === 'string') {
    try {
      return JSON.parse(entry) as StoredChatMessage
    } catch {
      return null
    }
  }

  if (entry && typeof entry === 'object' && typeof (entry as StoredChatMessage).message === 'string') {
    return entry as StoredChatMessage
  }

  return null
}

/**
 * Persist a chat message. Silently no-ops if Redis is unavailable.
 */
export async function persistChatMessage(msg: StoredChatMessage): Promise<void> {
  const redis = await getChatRedisClient()
  if (!redis) return

  const key = lobbyKey(msg.lobbyCode)
  const serialized = JSON.stringify({ ...msg, timestamp: msg.timestamp ?? Date.now() })

  try {
    // LPUSH so newest is at index 0, then trim to MAX_MESSAGES
    await redis.lpush(key, serialized)
    await redis.ltrim(key, 0, MAX_MESSAGES - 1)
    await redis.expire(key, TTL_SECONDS)
  } catch (err) {
    logger.warn('chat-history: failed to persist message', {
      lobbyCode: msg.lobbyCode,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Fetch chat history for a lobby (newest-first from Redis → returned oldest-first).
 * Returns empty array if Redis is unavailable or key doesn't exist.
 */
export async function getChatHistory(lobbyCode: string): Promise<StoredChatMessage[]> {
  const redis = await getChatRedisClient()
  if (!redis) return []

  try {
    const raw = await redis.lrange(lobbyKey(lobbyCode), 0, MAX_MESSAGES - 1)
    // raw is newest-first; reverse to get chronological order
    return raw
      .map(parseStoredMessage)
      .filter((m): m is StoredChatMessage => m !== null)
      .reverse()
  } catch (err) {
    logger.warn('chat-history: failed to fetch history', {
      lobbyCode,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
