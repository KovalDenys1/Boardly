interface SocketRateLimitEntry {
  count: number
  resetTime: number
}

interface SocketRateLimitOptions {
  maxEventsPerSecond?: number
  staleThresholdMs?: number
}

export function createSocketRateLimiter(options: SocketRateLimitOptions = {}) {
  const limits = new Map<string, SocketRateLimitEntry>()
  const maxEventsPerSecond = options.maxEventsPerSecond ?? 10
  const staleThresholdMs = options.staleThresholdMs ?? 60000

  function checkRateLimit(socketId: string): boolean {
    const now = Date.now()
    const limit = limits.get(socketId)

    if (!limit || now > limit.resetTime) {
      limits.set(socketId, { count: 1, resetTime: now + 1000 })
      return true
    }

    if (limit.count >= maxEventsPerSecond) {
      return false
    }

    limit.count += 1
    return true
  }

  function clearSocket(socketId: string) {
    limits.delete(socketId)
  }

  function cleanupStaleLimits() {
    const now = Date.now()
    let cleaned = 0

    for (const [socketId, limit] of limits.entries()) {
      if (now > limit.resetTime + staleThresholdMs) {
        limits.delete(socketId)
        cleaned += 1
      }
    }

    return {
      cleaned,
      remaining: limits.size,
    }
  }

  return {
    checkRateLimit,
    clearSocket,
    cleanupStaleLimits,
  }
}

