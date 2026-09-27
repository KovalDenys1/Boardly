import { Redis } from '@upstash/redis'
import { getRedisRestCredentials, RATE_LIMIT_WINDOW_KEY_PREFIX } from '@/lib/redis-credentials'

/**
 * Clear the rate-limit counters this machine's test runs produce.
 *
 * Rate limiting became a *shared* store the moment Redis was connected (#854),
 * which is the point — but it also means the suite now competes with itself.
 * The auth preset is five requests per fifteen minutes, and every spectator
 * test needs a guest who is not a player, so a full run exhausts it partway
 * through and the rest of the suite fails on 429s that say nothing about the
 * product. Before, the counters lived in the dev server's memory and a restart
 * forgave everything.
 *
 * Only loopback keys are touched. The limiter keys on the client IP taken from
 * x-real-ip or the rightmost x-forwarded-for (see lib/rate-limit.ts); behind
 * Vercel that is always a real address. `::1` and `127.0.0.1` can only come
 * from a request made on this machine, and `unknown` only from one with neither
 * header — so this cannot reach a real user's counters.
 */
const LOOPBACK_CLIENTS = ['::1', '127.0.0.1', 'unknown']

export async function clearLoopbackRateLimits(): Promise<number> {
  const credentials = getRedisRestCredentials()
  if (!credentials) return 0

  const redis = new Redis(credentials)
  let removed = 0

  // Since #1156 the counters are fields `<client>:<scope>` in one hash per window
  // (`rate_limit_window:<windowMs>:<window>`), so each window's hash is searched for this
  // machine's fields and only those are removed; everyone else's stay.
  const windowKeys: string[] = []
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, {
      match: `${RATE_LIMIT_WINDOW_KEY_PREFIX}*`,
      count: 200,
    })
    cursor = String(next)
    windowKeys.push(...keys)
  } while (cursor !== '0')

  for (const windowKey of windowKeys) {
    for (const client of LOOPBACK_CLIENTS) {
      let fieldCursor = '0'
      do {
        const [next, entries] = await redis.hscan(windowKey, fieldCursor, {
          match: `${client}:*`,
          count: 200,
        })
        fieldCursor = String(next)
        // HSCAN answers field, value, field, value...
        const fields = entries.filter((_, index) => index % 2 === 0).map(String)
        if (fields.length > 0) {
          await redis.hdel(windowKey, ...fields)
          removed += fields.length
        }
      } while (fieldCursor !== '0')
    }
  }

  // One key per counter, as a dev server still running the code from before #1156 writes.
  for (const client of LOOPBACK_CLIENTS) {
    let legacyCursor = '0'
    do {
      const [next, keys] = await redis.scan(legacyCursor, {
        match: `rate_limit:${client}:*`,
        count: 200,
      })
      legacyCursor = String(next)
      if (keys.length > 0) {
        await redis.del(...keys)
        removed += keys.length
      }
    } while (legacyCursor !== '0')
  }

  return removed
}
