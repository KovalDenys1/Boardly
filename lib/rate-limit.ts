import { NextRequest, NextResponse } from 'next/server'
import { getRedisRestCredentials, REDIS_CREDENTIALS_MISSING_MESSAGE } from './redis-credentials'
import { logger } from './logger'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum number of requests per window
  message?: string // Custom error message
  /**
   * Buckets every path under one key instead of one per pathname. Needed where the
   * path itself is the variable being walked (`/og/lobby/<code>`): per-path keys would
   * give each code its own fresh allowance and limit nothing.
   */
  keyScope?: string
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

// In-memory store for rate limiting (use Redis in production for multi-instance deployments)
const inMemoryStore: InMemoryRateLimitStore = {}
const REDIS_ERROR_LOG_INTERVAL_MS = 60 * 1000

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanupAt = 0
let lastRedisErrorLogAt = 0
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
        logRedisErrorOncePerWindow(error)
        upstashRedisClient = null
        return null
      })
      .finally(() => {
        upstashRedisClientPromise = null
      })
  }

  return upstashRedisClientPromise
}

function logRedisErrorOncePerWindow(error: unknown) {
  const now = Date.now()
  if (now - lastRedisErrorLogAt < REDIS_ERROR_LOG_INTERVAL_MS) {
    return
  }
  lastRedisErrorLogAt = now
  logger.warn('Shared rate limiter backend failed. Falling back to memory store.', {
    error: error instanceof Error ? error.message : String(error),
  })
}

function cleanupExpiredEntries(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return

  Object.keys(inMemoryStore).forEach((key) => {
    if (inMemoryStore[key].resetTime < now) {
      delete inMemoryStore[key]
    }
  })

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
  now: number
): Promise<{ count: number; resetTime: number } | null> {
  const redis = await getUpstashRedisClient()
  if (!redis) {
    return null
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
      count,
      resetTime,
    }
  } catch (error) {
    logRedisErrorOncePerWindow(error)
    return null
  }
}

/**
 * Simple in-memory rate limiter middleware for Next.js API routes
 * For production with multiple instances, use Redis instead
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later.',
    keyScope,
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

    const now = Date.now()
    const sharedRecord = await consumeSharedRateLimit(key, windowMs, now)
    const record = sharedRecord ?? consumeInMemoryRateLimit(key, windowMs, now)

    if (record.count > maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((record.resetTime - now) / 1000)
      
      return NextResponse.json(
        { error: message, retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(record.resetTime).toISOString(),
          }
        }
      )
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
  
  // Strict limit for lobby creation
  lobbyCreation: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Too many lobbies created. Please try again later.'
  },

  // Relaxed limit for premium lobby creation
  lobbyCreationPremium: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 30,
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
