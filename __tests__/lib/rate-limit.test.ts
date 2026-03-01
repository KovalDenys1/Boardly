/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'

type RateLimitModule = typeof import('@/lib/rate-limit')

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/test-rate-limit', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '203.0.113.10',
    },
  })
}

async function loadRateLimitModule(redisImplementation?: Record<string, unknown>): Promise<RateLimitModule> {
  jest.resetModules()
  jest.doMock('@/lib/logger', () => ({
    logger: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }))

  if (redisImplementation) {
    jest.doMock('@upstash/redis', () => ({
      Redis: jest.fn(() => redisImplementation),
    }))
  } else {
    jest.doMock('@upstash/redis', () => ({
      Redis: jest.fn(() => ({
        incr: jest.fn(async () => 1),
        expire: jest.fn(async () => 1),
      })),
    }))
  }

  return import('@/lib/rate-limit')
}

describe('rateLimit store backends', () => {
  const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

  afterEach(() => {
    if (typeof originalUpstashUrl === 'string') {
      process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl
    } else {
      delete process.env.UPSTASH_REDIS_REST_URL
    }

    if (typeof originalUpstashToken === 'string') {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken
    } else {
      delete process.env.UPSTASH_REDIS_REST_TOKEN
    }
  })

  it('uses in-memory backend when Upstash env is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule()
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    expect(__rateLimitTestUtils.getBackend()).toBe('memory')

    const limiter = rateLimit({
      windowMs: 1_000,
      maxRequests: 2,
    })

    const first = await limiter(makeRequest())
    const second = await limiter(makeRequest())
    const third = await limiter(makeRequest())

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(third?.status).toBe(429)
  })

  it('uses shared backend when Upstash env is configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const incr = jest.fn(async () => 1)
    const expire = jest.fn(async () => 1)
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ incr, expire })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    expect(__rateLimitTestUtils.getBackend()).toBe('shared')

    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 10,
    })

    const result = await limiter(makeRequest())

    expect(result).toBeNull()
    expect(incr).toHaveBeenCalledTimes(1)
    expect(expire).toHaveBeenCalledTimes(1)
  })

  it('falls back to in-memory backend when shared backend errors', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const incr = jest.fn(async () => {
      throw new Error('redis unavailable')
    })
    const expire = jest.fn(async () => 1)
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ incr, expire })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 1,
    })

    const first = await limiter(makeRequest())
    const second = await limiter(makeRequest())

    expect(first).toBeNull()
    expect(second?.status).toBe(429)
    expect(incr).toHaveBeenCalled()
    expect(expire).not.toHaveBeenCalled()
  })
})
