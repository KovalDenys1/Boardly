import { NextRequest, NextResponse } from 'next/server'
import { getRedisRestCredentials, REDIS_CREDENTIALS_MISSING_MESSAGE } from './redis-credentials'
import { logger } from './logger'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum number of requests per window
  message?: string // Custom error message
  /**
   * Buckets every path under one key instead of one per pathname. Needed where the
   * path itself is the variable being walked (`/og/lobby/<code>`, `/api/lobby/<code>/…`):
   * per-path keys would give each code its own fresh allowance and limit nothing.
   */
  keyScope?: string
  /**
   * Refuse with 503 when the shared store is configured but fails, instead of falling back
   * to the per-instance memory store (#1156). The memory store is ineffective on Vercel -
   * the real limit becomes the configured one times the number of warm instances - so on
   * the routes that mint accounts, guests, lobbies or mail, a limiter that silently stops
   * limiting is worse than a minute of refusals. Game actions stay fail-open.
   *
   * An unconfigured store (local dev, tests) is not a failure and still uses memory.
   */
  failClosed?: boolean
}

interface InMemoryRateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

interface SharedRateLimitStoreClient {
  incr(key: string): Promise<unknown>
  expire(key: string, ttlSeconds: number): Promise<unknown>
}

interface UpstashRedisModule {
  Redis: new (config: { url: string; token: string }) => SharedRateLimitStoreClient
}

type SharedConsumeResult =
  | { kind: 'ok'; count: number; resetTime: number }
  | { kind: 'unconfigured' }
  | { kind: 'failed'; error: unknown }

// In-memory store: the fallback for an unconfigured shared store, and for fail-open routes
// when the shared store errors.
const inMemoryStore: InMemoryRateLimitStore = {}
/**
 * Per-instance memory of keys the shared store has already reported over the limit, with
 * the end of their window (#1156). While a key is in here the limiter answers 429 without
 * asking Upstash, so a flood from one address costs one command per instance per window
 * instead of one per request - the same idea as @upstash/ratelimit's `ephemeralCache`.
 * It can only ever refuse early what the shared store already refused; it never admits.
 */
const blockedUntil = new Map<string, number>()
const BLOCKED_CACHE_MAX_ENTRIES = 10_000
const REDIS_ERROR_LOG_INTERVAL_MS = 60 * 1000
const RATE_LIMITED_EVENT_INTERVAL_MS = 60 * 1000

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanupAt = 0
let lastRedisErrorLogAt = 0
const lastRateLimitedEventAt = new Map<string, number>()
let upstashRedisClient: SharedRateLimitStoreClient | null | undefined = undefined
let upstashRedisClientPromise: Promise<SharedRateLimitStoreClient | null> | null = null

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function resolveRateLimitBackend(): 'shared' | 'memory' {
  const hasSharedConfig = getRedisRestCredentials() !== null

  if (!hasSharedConfig) {
    return 'memory'
  }

  return upstashRedisClient === null ? 'memory' : 'shared'
}

async function getUpstashRedisClient(): Promise<SharedRateLimitStoreClient | null> {
  if (upstashRedisClient !== undefined) {
    return upstashRedisClient
  }

  const credentials = getRedisRestCredentials()

  if (!credentials) {
    logger?.warn(
      `${REDIS_CREDENTIALS_MISSING_MESSAGE} ` +
      'Rate limiting falls back to an in-memory store, which is per-instance and ' +
      'therefore ineffective on Vercel: the real limit becomes the configured one ' +
      'multiplied by however many instances are warm.'
    )
    upstashRedisClient = null
    return upstashRedisClient
  }

  const { url, token } = credentials

  if (!upstashRedisClientPromise) {
    upstashRedisClientPromise = import('@upstash/redis')
      .then((module) => {
        const RedisConstructor = (module as UpstashRedisModule).Redis
        if (typeof RedisConstructor !== 'function') {
          throw new Error('Upstash Redis module did not expose Redis constructor')
        }

        upstashRedisClient = new RedisConstructor({ url, token })
        return upstashRedisClient
      })
      .catch((error) => {
        void reportSharedStoreDegraded(error, 'client-init')
        upstashRedisClient = null
        return null
      })
      .finally(() => {
        upstashRedisClientPromise = null
      })
  }

  return upstashRedisClientPromise
}

/**
 * A shared-store failure used to be a `logger.warn` and nothing else, so the limiter could
 * spend a month in per-instance memory unnoticed (#1156). Now it is also an OperationalEvent
 * that the `rate_limiter_degraded` rule alerts on. Once per minute per instance, so an
 * outage writes a handful of rows rather than one per request.
 */
async function reportSharedStoreDegraded(error: unknown, scope: string): Promise<void> {
  const now = Date.now()
  if (now - lastRedisErrorLogAt < REDIS_ERROR_LOG_INTERVAL_MS) {
    return
  }
  lastRedisErrorLogAt = now
  const message = error instanceof Error ? error.message : String(error)
  logger.warn('Shared rate limiter backend failed.', { error: message, scope })

  try {
    // Imported lazily: this module has no database dependency otherwise, and the
    // event is the rare path.
    const { recordServerReliabilityEvent } = await import('./server-operational-events')
    await recordServerReliabilityEvent({
      eventName: 'rate_limiter_degraded',
      source: scope,
      reason: message,
    })
  } catch {
    // Bookkeeping must never fail the request.
  }
}

/**
 * The first refusal of a key in its window is recorded, so the alert engine can see 429
 * volume (#1150); later refusals in the same window are not, and each scope writes at
 * most once a minute per instance. No IP is written - `source` is the route or scope.
 */
async function reportRateLimited(scope: string, now: number): Promise<void> {
  const previous = lastRateLimitedEventAt.get(scope)
  if (previous !== undefined && now - previous < RATE_LIMITED_EVENT_INTERVAL_MS) return
  if (lastRateLimitedEventAt.size > 1000) lastRateLimitedEventAt.clear()
  lastRateLimitedEventAt.set(scope, now)

  try {
    const { recordServerReliabilityEvent } = await import('./server-operational-events')
    await recordServerReliabilityEvent({
      eventName: 'rate_limited',
      source: scope,
      statusCode: 429,
    })
  } catch {
    // Bookkeeping must never fail the request.
  }
}

function cleanupExpiredEntries(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return

  Object.keys(inMemoryStore).forEach((key) => {
    if (inMemoryStore[key].resetTime < now) {
      delete inMemoryStore[key]
    }
  })

  for (const [key, until] of blockedUntil) {
    if (until <= now) blockedUntil.delete(key)
  }

  lastCleanupAt = now
}

function consumeInMemoryRateLimit(key: string, windowMs: number, now: number): {
  count: number
  resetTime: number
} {
  cleanupExpiredEntries(now)
  const record = inMemoryStore[key]

  if (!record || now > record.resetTime) {
    inMemoryStore[key] = {
      count: 1,
      resetTime: now + windowMs,
    }
    return inMemoryStore[key]
  }

  record.count += 1
  return record
}

async function consumeSharedRateLimit(
  key: string,
  windowMs: number,
  now: number,
  scope: string
): Promise<SharedConsumeResult> {
  if (!getRedisRestCredentials()) {
    return { kind: 'unconfigured' }
  }

  const redis = await getUpstashRedisClient()
  if (!redis) {
    return { kind: 'failed', error: new Error('Shared rate limiter client unavailable') }
  }

  const windowBucket = Math.floor(now / windowMs)
  const resetTime = (windowBucket + 1) * windowMs
  const redisKey = `rate_limit:${key}:${windowMs}:${windowBucket}`
  const ttlSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000))

  try {
    const currentCount = await redis.incr(redisKey)
    if (currentCount === 1) {
      await redis.expire(redisKey, ttlSeconds)
    }

    const count = isSafeInteger(currentCount)
      ? currentCount
      : Number.parseInt(String(currentCount), 10)

    if (!isSafeInteger(count)) {
      throw new Error('Unexpected shared rate limiter count response')
    }

    return {
      kind: 'ok',
      count,
      resetTime,
    }
  } catch (error) {
    await reportSharedStoreDegraded(error, scope)
    return { kind: 'failed', error }
  }
}

function tooManyRequests(message: string, maxRequests: number, resetTime: number, now: number) {
  const retryAfter = Math.max(1, Math.ceil((resetTime - now) / 1000))

  return NextResponse.json(
    { error: message, retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(resetTime).toISOString(),
      }
    }
  )
}

const LIMITER_UNAVAILABLE_RETRY_AFTER_SECONDS = 30

/**
 * Rate limiter for Next.js API routes. Counts in the shared Upstash store when it is
 * configured; see `failClosed` for what happens when it fails.
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later.',
    keyScope,
    failClosed = false,
  } = config

  return async (request: NextRequest): Promise<NextResponse | null> => {
    // Prefer x-real-ip (set by Vercel/proxy, not client-controllable).
    // Fall back to the rightmost value in x-forwarded-for (appended by Vercel).
    // Never use the leftmost value — clients can spoof it to bypass rate limits.
    const ip =
      request.headers.get('x-real-ip') ||
      (request.headers.get('x-forwarded-for') ?? '').split(',').at(-1)?.trim() ||
      'unknown'

    // Create unique key for this IP and endpoint
    const scope = keyScope ?? new URL(request.url).pathname
    const key = `${ip}:${scope}`
    const blockKey = `${key}:${windowMs}:${maxRequests}`

    const now = Date.now()

    const knownBlockedUntil = blockedUntil.get(blockKey)
    if (knownBlockedUntil !== undefined) {
      if (knownBlockedUntil > now) {
        return tooManyRequests(message, maxRequests, knownBlockedUntil, now)
      }
      blockedUntil.delete(blockKey)
    }

    const shared = await consumeSharedRateLimit(key, windowMs, now, scope)

    let record: { count: number; resetTime: number }
    if (shared.kind === 'ok') {
      record = shared
    } else if (shared.kind === 'failed' && failClosed) {
      return NextResponse.json(
        {
          error: 'This is temporarily unavailable. Please try again in a minute.',
          retryAfter: LIMITER_UNAVAILABLE_RETRY_AFTER_SECONDS,
        },
        {
          status: 503,
          headers: { 'Retry-After': LIMITER_UNAVAILABLE_RETRY_AFTER_SECONDS.toString() },
        }
      )
    } else {
      record = consumeInMemoryRateLimit(key, windowMs, now)
    }

    if (record.count > maxRequests) {
      if (shared.kind === 'ok') {
        if (blockedUntil.size >= BLOCKED_CACHE_MAX_ENTRIES) blockedUntil.clear()
        blockedUntil.set(blockKey, record.resetTime)
      }
      if (record.count === maxRequests + 1) {
        await reportRateLimited(scope, now)
      }
      return tooManyRequests(message, maxRequests, record.resetTime, now)
    }

    return null // Allow request
  }
}

/**
 * Preset rate limit configurations
 */
export const rateLimitPresets = {
  // Strict limit for authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts. Please try again in 15 minutes.'
  },

  // Password sign-in via NextAuth's credentials callback (#714). Slightly more
  // forgiving than `auth` because this is the primary login path for real users
  // — a shared IP (household, cafe, office NAT) can legitimately produce several
  // attempts in a window, and the limiter counts successes too, not just
  // failures. Still bounds offline-style guessing to ~40 attempts/hour per IP.
  credentialsLogin: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    message: 'Too many sign-in attempts. Please try again in 15 minutes.'
  },

  // Standard limit for general API endpoints
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  },

  // Lenient limit for game actions (needs to be fast)
  game: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120,
    message: 'Too many game actions. Please slow down.'
  },

  // Guest joins by lobby code (#1157). One bucket per IP across every code: the path
  // carries the 4-digit code, so per-path keys gave each of the 10,000 codes its own
  // allowance. Token-holding rejoins count here too, at the game-action rate.
  lobbyJoinGuest: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120,
    keyScope: 'lobby-join-guest',
    failClosed: true,
    message: 'Too many join attempts. Please slow down.'
  },

  // A join without a valid guest token mints a new guest identity (#1157), so it gets
  // the budget of /api/auth/guest-session, which does the same thing, rather than the
  // game-action one: about ten new identities per fifteen minutes per IP.
  lobbyJoinNewGuest: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    keyScope: 'lobby-join-new-guest',
    failClosed: true,
    message: 'Too many new guests from this network. Please try again in 15 minutes.'
  },

  // Lobby chat posts (#1157): one bucket per IP across every lobby.
  lobbyChatPost: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    keyScope: 'lobby-chat-post',
    message: 'Too many messages. Please slow down.'
  },

  // Strict limit for lobby creation
  lobbyCreation: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    failClosed: true,
    message: 'Too many lobbies created. Please try again later.'
  },

  // Relaxed limit for premium lobby creation
  lobbyCreationPremium: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 30,
    failClosed: true,
    message: 'Too many lobbies created. Please try again later.'
  },

  // Uncached invite-card renders (#1091). One bucket per IP across every lobby
  // code, so walking the 4-digit code space costs the caller, not us. Cache hits
  // never reach the function, so crawlers re-fetching a shared link do not count.
  ogLobbyImage: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    keyScope: 'og-lobby',
    message: 'Too many requests. Please slow down.'
  },

  // Strict limit for friend requests (abuse prevention)
  friendRequest: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 15,
    message: 'Too many friend requests. Please try again later.'
  }
}

/**
 * `auth` for the routes that mint an account or a guest, or send mail: register,
 * guest-session, forgot-password, resend-verification (#1156).
 */
export const failClosedAuthPreset = { ...rateLimitPresets.auth, failClosed: true }

/**
 * Helper to apply rate limiting to a route handler
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const rateLimitResult = await rateLimit(config)(req)

    if (rateLimitResult) {
      return rateLimitResult // Rate limit exceeded
    }

    return handler(req) // Continue to handler
  }
}

export const __rateLimitTestUtils = {
  clearInMemoryStore() {
    for (const key of Object.keys(inMemoryStore)) {
      delete inMemoryStore[key]
    }
    blockedUntil.clear()
    lastRateLimitedEventAt.clear()
    lastCleanupAt = 0
    lastRedisErrorLogAt = 0
  },
  resetSharedClient() {
    upstashRedisClient = undefined
    upstashRedisClientPromise = null
  },
  getBackend() {
    return resolveRateLimitBackend()
  },
}
