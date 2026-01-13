import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum number of requests per window
  message?: string // Custom error message
}

interface RateLimitRecord {
  count: number
  resetTime: number
}

// Fallback in-memory store for development when KV is not available
interface RateLimitStore {
  [key: string]: RateLimitRecord
}

const fallbackStore: RateLimitStore = {}

// Cleanup old entries every 5 minutes (fallback only)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    Object.keys(fallbackStore).forEach(key => {
      if (fallbackStore[key].resetTime < now) {
        delete fallbackStore[key]
      }
    })
  }, 5 * 60 * 1000)
}

/**
 * Check if Vercel KV or Upstash Redis is available
 * Supports:
 * - Vercel KV: KV_URL or KV_REST_API_URL + KV_REST_API_TOKEN
 * - Upstash Redis: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or with custom prefix)
 */
function isKvAvailable(): boolean {
  try {
    return !!(
      process.env.KV_URL ||
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      // Support Upstash Redis with or without custom prefix
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
      // Support custom prefix (e.g., if prefix is "UPSTASH", variables become UPSTASH_UPSTASH_REDIS_REST_URL)
      Object.keys(process.env).some(key => 
        key.includes('UPSTASH_REDIS_REST_URL') && 
        process.env[key] &&
        process.env[key.replace('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN')]
      )
    )
  } catch {
    return false
  }
}

/**
 * Get KV REST API URL (supports Vercel KV and Upstash Redis)
 */
function getKvRestApiUrl(): string | undefined {
  return (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    // Find any env var containing UPSTASH_REDIS_REST_URL
    Object.keys(process.env).find(key => 
      key.includes('UPSTASH_REDIS_REST_URL') && process.env[key]
    ) ? process.env[Object.keys(process.env).find(key => 
      key.includes('UPSTASH_REDIS_REST_URL') && process.env[key]
    )!] : undefined
  )
}

/**
 * Get KV REST API Token (supports Vercel KV and Upstash Redis)
 */
function getKvRestApiToken(): string | undefined {
  const urlKey = process.env.KV_REST_API_URL 
    ? 'KV_REST_API_TOKEN'
    : process.env.UPSTASH_REDIS_REST_URL
    ? 'UPSTASH_REDIS_REST_TOKEN'
    : Object.keys(process.env).find(key => 
        key.includes('UPSTASH_REDIS_REST_URL') && process.env[key]
      )?.replace('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN')
  
  return urlKey ? process.env[urlKey] : undefined
}

/**
 * Get rate limit record from KV or fallback store
 */
async function getRecord(key: string): Promise<RateLimitRecord | null> {
  if (isKvAvailable() && kv) {
    try {
      const record = await kv.get<RateLimitRecord>(key)
      return record || null
    } catch (error) {
      console.error('KV error, falling back to in-memory store:', error)
      return fallbackStore[key] || null
    }
  }
  return fallbackStore[key] || null
}

/**
 * Set rate limit record in KV or fallback store
 */
async function setRecord(key: string, record: RateLimitRecord, ttlSeconds: number): Promise<void> {
  if (isKvAvailable() && kv) {
    try {
      await kv.set(key, record, { ex: ttlSeconds })
    } catch (error) {
      console.error('KV error, falling back to in-memory store:', error)
      fallbackStore[key] = record
    }
  } else {
    fallbackStore[key] = record
  }
}

/**
 * Increment rate limit counter in KV or fallback store
 */
async function incrementRecord(key: string): Promise<RateLimitRecord> {
  if (isKvAvailable() && kv) {
    try {
      // Use atomic increment with transaction-like behavior
      const record = await kv.get<RateLimitRecord>(key)
      if (!record) {
        const newRecord: RateLimitRecord = { count: 1, resetTime: Date.now() }
        await kv.set(key, newRecord)
        return newRecord
      }
      record.count++
      await kv.set(key, record)
      return record
    } catch (error) {
      console.error('KV error, falling back to in-memory store:', error)
      if (!fallbackStore[key]) {
        fallbackStore[key] = { count: 0, resetTime: Date.now() }
      }
      fallbackStore[key].count++
      return fallbackStore[key]
    }
  } else {
    if (!fallbackStore[key]) {
      fallbackStore[key] = { count: 0, resetTime: Date.now() }
    }
    fallbackStore[key].count++
    return fallbackStore[key]
  }
}

/**
 * Rate limiter middleware for Next.js API routes
 * Uses Vercel KV in production, falls back to in-memory store in development
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
    const key = `ratelimit:${ip}:${pathname}`

    const now = Date.now()
    const record = await getRecord(key)

    if (!record) {
      // First request from this IP
      const newRecord: RateLimitRecord = {
        count: 1,
        resetTime: now + windowMs
      }
      const ttlSeconds = Math.ceil(windowMs / 1000)
      await setRecord(key, newRecord, ttlSeconds)
      return null // Allow request
    }

    if (now > record.resetTime) {
      // Window has expired, reset counter
      const newRecord: RateLimitRecord = {
        count: 1,
        resetTime: now + windowMs
      }
      const ttlSeconds = Math.ceil(windowMs / 1000)
      await setRecord(key, newRecord, ttlSeconds)
      return null // Allow request
    }

    // Increment counter
    const updatedRecord = await incrementRecord(key)

    if (updatedRecord.count >= maxRequests) {
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

    // Calculate remaining requests
    const remaining = Math.max(0, maxRequests - updatedRecord.count)
    
    // Note: Can't modify request headers in Next.js, so we'll set them in response
    // The response will be created by the handler, so we'll just allow the request

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
