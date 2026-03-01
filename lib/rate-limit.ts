import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { logger } from './logger'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum number of requests per window
  message?: string // Custom error message
}

interface InMemoryRateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

// In-memory store for rate limiting (use Redis in production for multi-instance deployments)
const inMemoryStore: InMemoryRateLimitStore = {}
const REDIS_ERROR_LOG_INTERVAL_MS = 60 * 1000

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanupAt = 0
let lastRedisErrorLogAt = 0
let upstashRedisClient: Redis | null | undefined = undefined

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function resolveRateLimitBackend(): 'shared' | 'memory' {
  return getUpstashRedisClient() ? 'shared' : 'memory'
}

function getUpstashRedisClient(): Redis | null {
  if (upstashRedisClient !== undefined) {
    return upstashRedisClient
  }

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    upstashRedisClient = null
    return upstashRedisClient
  }

  upstashRedisClient = new Redis({
    url,
    token,
  })

  return upstashRedisClient
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
  const redis = getUpstashRedisClient()
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
    message = 'Too many requests, please try again later.'
  } = config

  return async (request: NextRequest): Promise<NextResponse | null> => {
    // Get client identifier (IP address)
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'
    
    // Create unique key for this IP and endpoint
    const pathname = new URL(request.url).pathname
    const key = `${ip}:${pathname}`

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
  },
  getBackend() {
    return resolveRateLimitBackend()
  },
}
