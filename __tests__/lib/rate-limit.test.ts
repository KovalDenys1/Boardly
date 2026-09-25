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

const recordServerReliabilityEvent = jest.fn(async (_event: { eventName: string; [key: string]: unknown }) => undefined)

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

  RedisConstructor.mockReset()
  RedisConstructor.mockImplementation(
    () =>
      redisImplementation ?? {
        hincrby: jest.fn(async () => 1),
        expire: jest.fn(async () => 1),
      }
  )
  jest.doMock('@upstash/redis', () => ({ Redis: RedisConstructor }))

  return import('@/lib/rate-limit')
}

const RedisConstructor = jest.fn()

/** A shared store that counts per hash field, the way HINCRBY does. */
function countingStore() {
  const counts = new Map<string, number>()
  const hincrby = jest.fn(async (key: string, field: string, increment: number) => {
    const next = (counts.get(`${key}|${field}`) ?? 0) + increment
    counts.set(`${key}|${field}`, next)
    return next
  })
  const expire = jest.fn(async (_key: string, _ttlSeconds: number) => 1)
  return { hincrby, expire }
}

function failingStore(message = 'fetch failed') {
  return {
    hincrby: jest.fn(async (_key: string, _field: string, _increment: number): Promise<number> => {
      throw new Error(message)
    }),
    expire: jest.fn(async (_key: string, _ttlSeconds: number) => 1),
  }
}

/**
 * Thirty seconds into a minute and into a quarter-hour, so a test's requests cannot
 * straddle a window boundary. Returns a setter for tests that move the clock.
 */
const PINNED_NOW = 1_800_000_030_000
function pinClock(at = PINNED_NOW) {
  let now = at
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  return (next: number) => {
    now = next
  }
}

function requestFrom(ip: string, path = '/api/test-rate-limit') {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'x-real-ip': ip },
  })
}

describe('rateLimit store backends', () => {
  const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

  afterEach(() => {
    jest.restoreAllMocks()
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

    const { hincrby, expire } = countingStore()
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ hincrby, expire })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    expect(__rateLimitTestUtils.getBackend()).toBe('shared')

    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 10,
    })

    const result = await limiter(makeRequest())

    expect(result).toBeNull()
    expect(hincrby).toHaveBeenCalledTimes(1)
    const [windowKey, field, increment] = hincrby.mock.calls[0]
    expect(windowKey).toMatch(/^rate_limit_window:60000:\d+$/)
    expect(field).toBe('203.0.113.10:/api/test-rate-limit')
    expect(increment).toBe(1)
    expect(expire).toHaveBeenCalledTimes(1)
    expect(expire.mock.calls[0][0]).toBe(windowKey)
  })

  it('falls back to in-memory backend when shared backend errors', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const { hincrby, expire } = failingStore('redis unavailable')
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ hincrby, expire })
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
    expect(hincrby).toHaveBeenCalled()
    expect(expire).not.toHaveBeenCalled()
  })

  it('builds its client to give up fast: one retry and a per-command deadline (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule(countingStore())
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    await rateLimit({ windowMs: 60_000, maxRequests: 10 })(makeRequest())

    expect(RedisConstructor).toHaveBeenCalledTimes(1)
    const config = RedisConstructor.mock.calls[0][0]
    expect(config).toMatchObject({
      url: 'https://example.upstash.io',
      token: 'token',
      retry: { retries: 1 },
    })
    // A function, so the client throws on the abort instead of returning "Aborted", and
    // each command gets a fresh 1.5 s deadline.
    expect(typeof config.signal).toBe('function')
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal)
    const first = config.signal()
    const second = config.signal()
    expect(timeout).toHaveBeenCalledTimes(2)
    expect(timeout).toHaveBeenCalledWith(1_500)
    expect(first.aborted).toBe(false)
    expect(second).not.toBe(first)
  })

  it('spends one command per counted request and one EXPIRE per window per instance (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    pinClock()
    const { hincrby, expire } = countingStore()
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ hincrby, expire })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    // A flood from rotating addresses, one request each: the case the per-address limit
    // cannot stop, and the one that used to cost INCR + EXPIRE every time.
    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 5, keyScope: 'register' })
    for (let i = 0; i < 20; i += 1) {
      expect(await limiter(requestFrom(`198.51.100.${i}`))).toBeNull()
    }
    expect(hincrby).toHaveBeenCalledTimes(20)
    expect(expire).toHaveBeenCalledTimes(1)

    // Another window length is another hash, with its own TTL.
    await rateLimit({ windowMs: 15 * 60_000, maxRequests: 5 })(requestFrom('198.51.100.1'))
    expect(expire).toHaveBeenCalledTimes(2)
    expect(expire.mock.calls[1][0]).toMatch(/^rate_limit_window:900000:\d+$/)
    // The TTL runs to the end of the window: thirty seconds into a quarter-hour.
    expect(expire.mock.calls[0][1]).toBe(30)
    expect(expire.mock.calls[1][1]).toBe(870)
  })

  it('retries a failed EXPIRE on the next request instead of leaving the window without a TTL', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    pinClock()
    const { hincrby } = countingStore()
    const expire = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(1)
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ hincrby, expire })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 10 })
    await limiter(makeRequest())
    await limiter(makeRequest())
    await limiter(makeRequest())

    expect(expire).toHaveBeenCalledTimes(2)
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

    const { rateLimit, __rateLimitTestUtils, failClosedAuthPreset, rateLimitPresets } =
      await loadRateLimitModule(failingStore())
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    // register, forgot-password, resend-verification and feedback: refused outright.
    for (const preset of [failClosedAuthPreset, { windowMs: 60_000, maxRequests: 5, failClosed: true }]) {
      const result = await rateLimit(preset)(makeRequest())
      expect(result?.status).toBe(503)
      expect(result?.headers.get('Retry-After')).toBe('30')
    }

    // Game actions stay fail-open on the memory store.
    expect(await rateLimit(rateLimitPresets.game)(makeRequest())).toBeNull()
  })

  it('keeps guest entry and lobby creation open while the store is down, under degraded limits (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://unreachable.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const { rateLimit, __rateLimitTestUtils, guestSessionPreset, rateLimitPresets } =
      await loadRateLimitModule(failingStore())
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const cases = [
      { preset: guestSessionPreset, path: '/api/auth/guest-session' },
      { preset: rateLimitPresets.lobbyJoinGuest, path: '/api/lobby/1234/join-guest' },
      { preset: rateLimitPresets.lobbyJoinNewGuest, path: '/api/lobby/1234/join-guest' },
      { preset: rateLimitPresets.lobbyCreation, path: '/api/lobby' },
      { preset: rateLimitPresets.lobbyCreationPremium, path: '/api/lobby' },
    ]
    for (const [index, { preset, path }] of cases.entries()) {
      const degraded = preset.degraded!
      // Tighter than the shared limit: memory is per instance.
      expect(degraded.maxRequests).toBeLessThan(preset.maxRequests)
      expect(degraded.maxRequests).toBeGreaterThanOrEqual(1)

      const limiter = rateLimit(preset)
      const ip = `203.0.113.${100 + index}`
      for (let i = 0; i < degraded.maxRequests; i += 1) {
        expect(await limiter(requestFrom(ip, path))).toBeNull()
      }
      const refused = await limiter(requestFrom(ip, path))
      expect(refused?.status).toBe(429)
      expect(refused?.headers.get('X-RateLimit-Limit')).toBe(String(degraded.maxRequests))
    }
  })

  it('caps every address together per instance while degraded, and one address cannot spend it (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://unreachable.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule(failingStore())
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const limiter = rateLimit({
      windowMs: 15 * 60_000,
      maxRequests: 5,
      failClosed: true,
      degraded: { maxRequests: 2, instanceMaxRequests: 6 },
    })

    // One address hammering: two admitted, the rest 429 - and none of those count
    // against the instance ceiling.
    for (let i = 0; i < 20; i += 1) await limiter(requestFrom('192.0.2.1'))

    // Four more addresses share the remaining four of six.
    const statuses: number[] = []
    for (let i = 2; i <= 5; i += 1) {
      statuses.push((await limiter(requestFrom(`192.0.2.${i}`)))?.status ?? 200)
      statuses.push((await limiter(requestFrom(`192.0.2.${i}`)))?.status ?? 200)
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(4)
    // Past the ceiling the route answers as it would with no degraded mode: 503.
    expect(statuses.filter((status) => status === 503)).toHaveLength(4)
  })

  it('stops calling a failing store for a while after three failures in a row (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://unreachable.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const setNow = pinClock()
    const store = failingStore()
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule(store)
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 100 })
    for (let i = 0; i < 10; i += 1) await limiter(makeRequest())
    expect(store.hincrby).toHaveBeenCalledTimes(3)

    // After the pause, one probe; it fails, so the pause starts again.
    setNow(PINNED_NOW + 15_001)
    await limiter(makeRequest())
    await limiter(makeRequest())
    expect(store.hincrby).toHaveBeenCalledTimes(4)

    // The store is back: the next probe succeeds and every request asks it again.
    store.hincrby.mockImplementation(async () => 1)
    setNow(PINNED_NOW + 30_002)
    await limiter(makeRequest())
    await limiter(makeRequest())
    await limiter(makeRequest())
    expect(store.hincrby).toHaveBeenCalledTimes(7)
  })

  it('records rate_limiter_degraded once per minute, not once per request (#1156)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://unreachable.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule(failingStore())
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

    pinClock()
    const { hincrby, expire } = countingStore()
    const { rateLimit, __rateLimitTestUtils } = await loadRateLimitModule({ hincrby, expire })
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()

    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 2 })
    expect(await limiter(makeRequest())).toBeNull()
    expect(await limiter(makeRequest())).toBeNull()
    expect((await limiter(makeRequest()))?.status).toBe(429)
    for (let i = 0; i < 10; i += 1) {
      expect((await limiter(makeRequest()))?.status).toBe(429)
    }

    expect(hincrby).toHaveBeenCalledTimes(3)
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

