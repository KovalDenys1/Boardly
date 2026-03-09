import { createSocketRateLimiter } from '@/lib/socket/socket-rate-limit'

describe('socket-rate-limit', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('allows events up to the configured per-second limit and then blocks', () => {
    const limiter = createSocketRateLimiter({ maxEventsPerSecond: 2 })

    expect(limiter.checkRateLimit('socket-1')).toBe(true)
    expect(limiter.checkRateLimit('socket-1')).toBe(true)
    expect(limiter.checkRateLimit('socket-1')).toBe(false)
  })

  it('resets the rate window after one second', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-03-09T12:00:00.000Z'))

    const limiter = createSocketRateLimiter({ maxEventsPerSecond: 1 })

    expect(limiter.checkRateLimit('socket-2')).toBe(true)
    expect(limiter.checkRateLimit('socket-2')).toBe(false)

    jest.setSystemTime(new Date('2026-03-09T12:00:01.100Z'))

    expect(limiter.checkRateLimit('socket-2')).toBe(true)
  })

  it('clears a socket entry explicitly', () => {
    const limiter = createSocketRateLimiter({ maxEventsPerSecond: 1 })

    expect(limiter.checkRateLimit('socket-3')).toBe(true)
    expect(limiter.checkRateLimit('socket-3')).toBe(false)

    limiter.clearSocket('socket-3')

    expect(limiter.checkRateLimit('socket-3')).toBe(true)
  })

  it('cleans up stale socket entries', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-03-09T12:00:00.000Z'))

    const limiter = createSocketRateLimiter({ staleThresholdMs: 5000 })

    expect(limiter.checkRateLimit('socket-a')).toBe(true)
    expect(limiter.checkRateLimit('socket-b')).toBe(true)

    jest.setSystemTime(new Date('2026-03-09T12:00:07.000Z'))

    expect(limiter.cleanupStaleLimits()).toEqual({
      cleaned: 2,
      remaining: 0,
    })
  })
})
