/**
 * Where the Upstash REST credentials come from.
 *
 * Two naming schemes are in play and the difference is not cosmetic. Connecting
 * Upstash through the Vercel Marketplace sets `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN`; connecting Upstash directly sets
 * `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The code read only
 * the second pair, production had only the first, and both callers are written
 * to degrade quietly when no credentials are found — so chat history returned
 * an empty list forever and rate limiting silently became per-instance
 * counters. #801 then made that empty list the only way a chat message could
 * reach anyone (#852, #854).
 *
 * Reading both is the whole fix. It is here rather than duplicated in the two
 * callers so the next place that wants Redis cannot pick just one of them.
 */

export interface RedisRestCredentials {
  url: string
  token: string
}

export function getRedisRestCredentials(): RedisRestCredentials | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

  if (!url || !token) return null
  return { url, token }
}

/** What to tell someone whose Redis is missing, naming both accepted spellings. */
export const REDIS_CREDENTIALS_MISSING_MESSAGE =
  'No Redis credentials found. Set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, ' +
  'or connect Upstash through the Vercel Marketplace, which sets ' +
  'KV_REST_API_URL / KV_REST_API_TOKEN.'

/**
 * Prefix of the rate limiter's per-window hashes (`<prefix><windowMs>:<window>`, fields
 * `<ip>:<scope>`; see lib/rate-limit.ts). Kept here, with the rest of what the app knows
 * about its Redis, so the e2e suite can clear its own counters without importing the
 * server-only limiter.
 */
export const RATE_LIMIT_WINDOW_KEY_PREFIX = 'rate_limit_window:'

/**
 * How long one Upstash command may take, its retry included, before it counts as failed.
 *
 * The REST client's defaults are five retries on a network error with exponential
 * backoff (50 ms × e^n) and no timeout at all (`@upstash/redis` 1.38, `HttpClient`), so an
 * unreachable store held every rate-limited request for 4-5 seconds before the limiter's
 * fallback even ran, and a store that accepts the connection and never answers held it
 * until the function timed out (#1156). Functions and the store both run in fra1, where a
 * healthy command takes milliseconds, so this is only ever reached by a store that is down.
 */
export const REDIS_REQUEST_TIMEOUT_MS = 1_500

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Redis request timed out')), ms)
  ;(timer as { unref?: () => void }).unref?.()
  return controller.signal
}

/**
 * Options for every Upstash client in the app: one retry, then give up within
 * REDIS_REQUEST_TIMEOUT_MS. The signal is a function on purpose. The client calls it once
 * per command, so each command gets its own deadline, and only with a function does an
 * abort surface as an error - given a plain AbortSignal the client swallows the abort and
 * hands back the string "Aborted" as though it were the command's result.
 */
export function upstashClientOptions() {
  return {
    retry: { retries: 1, backoff: () => 50 },
    signal: () => timeoutSignal(REDIS_REQUEST_TIMEOUT_MS),
  }
}
