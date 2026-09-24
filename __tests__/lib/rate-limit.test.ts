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

const recordServerReliabilityEvent = jest.fn(async () => undefined)

async function loadRateLimitModule(redisImplementation?: Record<string, unknown>): Promise<RateLimitModule> {
  jest.resetModules()
  recordServerReliabilityEvent.mockClear()
  jest.doMock('@/lib/server-operational-events', () => ({ recordServerReliabilityEvent }))
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

  it('keyScope buckets every path together, so varying the path buys no fresh allowance', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule()
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const req = (code: string) =>
      new NextRequest(`http://localhost:3000/og/lobby/${code}`, { headers: { 'x-real-ip': '203.0.113.20' } })

    const scoped = rateLimit({ windowMs: 60_000, maxRequests: 2, keyScope: 'og-lobby' })
    expect(await scoped(req('1111'))).toBeNull()
    expect(await scoped(req('2222'))).toBeNull()
    expect((await scoped(req('3333')))?.status).toBe(429)

    const perPath = rateLimit({ windowMs: 60_000, maxRequests: 1 })
    expect(await perPath(req('4444'))).toBeNull()
    expect(await perPath(req('5555'))).toBeNull()
  })

  it('falls closed with 503 on a shared-store failure where the route asks for it (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://unreachable.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const incr = jest.fn(async () => {
      throw new Error('fetch failed')
    })
    const { rateLimit, __rateLimitTestUtils, failClosedAuthPreset, rateLimitPresets } =
      await loadRateLimitModule({ incr, expire: jest.fn() })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    for (const preset of [
      failClosedAuthPreset,
      rateLimitPresets.lobbyJoinGuest,
      rateLimitPresets.lobbyJoinNewGuest,
      rateLimitPresets.lobbyCreation,
    ]) {
      const result = await rateLimit(preset)(makeRequest())
      expect(result?.status).toBe(503)
      expect(result?.headers.get('Retry-After')).toBe('30')
    }

    // Game actions stay fail-open on the memory store.
    expect(await rateLimit(rateLimitPresets.game)(makeRequest())).toBeNull()
  })

  it('records rate_limiter_degraded once per minute, not once per request (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://unreachable.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const incr = jest.fn(async () => {
      throw new Error('fetch failed')
    })
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ incr, expire: jest.fn() })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 100, keyScope: 'register' })
    for (let i = 0; i < 5; i += 1) await limiter(makeRequest())

    const degraded = recordServerReliabilityEvent.mock.calls.filter(
      ([event]) => event.eventName === 'rate_limiter_degraded'
    )
    expect(degraded).toHaveLength(1)
    expect(degraded[0][0]).toMatchObject({ source: 'register', reason: 'fetch failed' })
  })

  it('stops asking the shared store once a key is over its limit (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    let count = 0
    const incr = jest.fn(async () => {
      count += 1
      return count
    })
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ incr, expire: jest.fn() })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 2 })
    expect(await limiter(makeRequest())).toBeNull()
    expect(await limiter(makeRequest())).toBeNull()
    expect((await limiter(makeRequest()))?.status).toBe(429)
    for (let i = 0; i < 10; i += 1) {
      expect((await limiter(makeRequest()))?.status).toBe(429)
    }

    expect(incr).toHaveBeenCalledTimes(3)
    // The first refusal is visible to the alert engine; the rest are not rows.
    const limited = recordServerReliabilityEvent.mock.calls.filter(
      ([event]) => event.eventName === 'rate_limited'
    )
    expect(limited).toHaveLength(1)
    expect(limited[0][0]).toMatchObject({ source: '/api/test-rate-limit', statusCode: 429 })
  })

  it('gives join-guest one bucket per IP across every lobby code (#1157)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { rateLimit, rateLimitPresets, __rateLimitTestUtils } = await loadRateLimitModule()
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const joinRequest = (code: string) =>
      new NextRequest(`http://localhost:3000/api/lobby/${code}/join-guest`, {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.30' },
      })

    const newGuest = rateLimit(rateLimitPresets.lobbyJoinNewGuest)
    const statuses: number[] = []
    for (let i = 0; i < 200; i += 1) {
      const code = String(1000 + (i % 20))
      const result = await newGuest(joinRequest(code))
      statuses.push(result?.status ?? 200)
    }

    expect(statuses.filter((status) => status === 200)).toHaveLength(
      rateLimitPresets.lobbyJoinNewGuest.maxRequests
    )
    expect(statuses.filter((status) => status === 429)).toHaveLength(
      200 - rateLimitPresets.lobbyJoinNewGuest.maxRequests
    )

    const join = rateLimit(rateLimitPresets.lobbyJoinGuest)
    let admitted = 0
    for (let i = 0; i < 130; i += 1) {
      if ((await join(joinRequest(String(2000 + i)))) === null) admitted += 1
    }
    expect(admitted).toBe(rateLimitPresets.lobbyJoinGuest.maxRequests)
  })
})

