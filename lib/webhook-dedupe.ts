/**
 * Redis-backed dedupe for webhook deliveries that would otherwise be
 * replayable within the delivery's own freshness window.
 *
 * #1121: Resend's inbound webhook signature only rejects a timestamp older
 * than 5 minutes; it never remembers a `svix-id`, so a captured delivery
 * (a proxy, a logging box, a compromised link in the chain) can be replayed
 * verbatim for the rest of that window and gets forwarded to support a
 * second time. `claimOnce` gives each delivery id a single-use claim with an
 * atomic `SET ... NX EX`, so a repeat within the TTL is told apart from a
 * first sighting without a read-then-write race.
 *
 * Degrades to "not a duplicate" when Redis is unavailable, the same as
 * chat-history.ts and rate-limit.ts: a misconfigured store should not turn
 * into dropped mail, and the underlying signature window already bounds how
 * long a replay is even possible without this file.
 */

import { logger } from './logger'
import { getRedisRestCredentials, REDIS_CREDENTIALS_MISSING_MESSAGE } from './redis-credentials'

interface DedupeRedisClient {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<string | null>
  del(key: string): Promise<unknown>
}

interface UpstashRedisModule {
  Redis: new (config: { url: string; token: string }) => DedupeRedisClient
}

let _client: DedupeRedisClient | null | undefined = undefined
let _clientPromise: Promise<DedupeRedisClient | null> | null = null

async function getDedupeRedisClient(scope: string): Promise<DedupeRedisClient | null> {
  if (_client !== undefined) return _client

  const credentials = getRedisRestCredentials()

  if (!credentials) {
    logger.warn(`${scope}: ${REDIS_CREDENTIALS_MISSING_MESSAGE} Replay dedupe is disabled.`)
    _client = null
    return null
  }

  const { url, token } = credentials

  if (!_clientPromise) {
    _clientPromise = import('@upstash/redis')
      .then((mod) => {
        const RedisConstructor = (mod as UpstashRedisModule).Redis
        _client = new RedisConstructor({ url, token })
        return _client
      })
      .catch((err) => {
        logger.warn(`${scope}: failed to init Redis client`, {
          error: err instanceof Error ? err.message : String(err),
        })
        _client = null
        return null
      })
      .finally(() => {
        _clientPromise = null
      })
  }

  return _clientPromise
}

export type ClaimResult = 'claimed' | 'duplicate' | 'unavailable'

/**
 * Atomically claims `key` for `ttlSeconds`: 'claimed' the first time,
 * 'duplicate' for any repeat before the TTL expires, 'unavailable' when
 * there is no shared store to ask (callers should fail open, matching every
 * other Redis-backed feature in this app).
 */
export async function claimOnce(key: string, ttlSeconds: number, scope: string): Promise<ClaimResult> {
  const redis = await getDedupeRedisClient(scope)
  if (!redis) return 'unavailable'

  try {
    const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds })
    return result === null ? 'duplicate' : 'claimed'
  } catch (err) {
    logger.warn(`${scope}: dedupe claim failed`, {
      error: err instanceof Error ? err.message : String(err),
    })
    return 'unavailable'
  }
}

/**
 * Releases a claim early, for a caller that asked its own delivery source to
 * retry (a transient failure: a 500 telling Resend to try again). Without
 * this, the retry would arrive with the same delivery id, see 'duplicate'
 * from the claim `POST /api/resend/inbound` already made on the first
 * attempt, and the message would be silently dropped instead of retried —
 * turning a transient failure into a permanent one. Never throws: a failed
 * release just means the claim's own TTL clears it later, which only costs
 * the retry within that window, not correctness.
 */
export async function release(key: string, scope: string): Promise<void> {
  const redis = await getDedupeRedisClient(scope)
  if (!redis) return

  try {
    await redis.del(key)
  } catch (err) {
    logger.warn(`${scope}: dedupe release failed`, {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export const __webhookDedupeTestUtils = {
  resetClient() {
    _client = undefined
    _clientPromise = null
  },
}
