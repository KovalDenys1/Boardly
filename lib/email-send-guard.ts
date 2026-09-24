import { createHash } from 'crypto'
import { getRedisRestCredentials } from './redis-credentials'
import { logger } from './logger'

/**
 * Throttle for the transactional mail an anonymous visitor can trigger (#1158): the
 * verification mail (register, resend-verification) and the password reset
 * (forgot-password).
 *
 * The per-IP route limiter alone let one address be mailed 480 times a day by rotating the
 * route's window, and nothing capped the day's total against Resend's plan. So before any
 * token is rotated or Resend is called, a send must pass, in order:
 *   1. a per-address cooldown - one mail of each kind per address per 10 minutes;
 *   2. a per-address daily cap - three of each kind per address per UTC day;
 *   3. a global daily budget across both kinds (EMAIL_DAILY_SEND_BUDGET, default 80:
 *      Resend Free allows 100 a day, and the rest of the product's mail needs headroom).
 * A refusal is silent to the caller: the routes answer exactly as they do for a send, so
 * the throttle reveals nothing about whether an address has an account.
 *
 * Counters live in the shared Upstash store, keyed by a SHA-256 of the address so no
 * address is stored in Redis. When the store is unconfigured or fails, a per-instance
 * memory store stands in; the routes in front of this already fail closed on a shared-store
 * error (#1156), so the fallback only matters in local development.
 */

export type TransactionalMailKind = 'verification' | 'password_reset'
export type MailSendRefusal = 'address_cooldown' | 'address_daily_cap' | 'daily_budget'
export type MailSendDecision = { allowed: true } | { allowed: false; reason: MailSendRefusal }

export const MAIL_ADDRESS_COOLDOWN_SECONDS = 10 * 60
export const MAIL_ADDRESS_DAILY_MAX = 3
export const DEFAULT_MAIL_DAILY_BUDGET = 80

const DAY_TTL_SECONDS = 26 * 60 * 60
const BUDGET_EVENT_INTERVAL_MS = 10 * 60 * 1000

interface GuardRedisClient {
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>
  incr(key: string): Promise<unknown>
  expire(key: string, ttlSeconds: number): Promise<unknown>
}

interface GuardStore {
  /** true when the key was absent and is now set for `ttlSeconds` */
  setIfAbsent(key: string, ttlSeconds: number, nowMs: number): Promise<boolean>
  increment(key: string, ttlSeconds: number, nowMs: number): Promise<number>
}

const memory = new Map<string, { value: number; expiresAt: number }>()

const memoryStore: GuardStore = {
  async setIfAbsent(key, ttlSeconds, now) {
    const existing = memory.get(key)
    if (existing && existing.expiresAt > now) return false
    memory.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 })
    return true
  },
  async increment(key, ttlSeconds, now) {
    const existing = memory.get(key)
    if (!existing || existing.expiresAt <= now) {
      memory.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 })
      return 1
    }
    existing.value += 1
    return existing.value
  },
}

let redisClientPromise: Promise<GuardRedisClient | null> | null = null

async function getRedisClient(): Promise<GuardRedisClient | null> {
  const credentials = getRedisRestCredentials()
  if (!credentials) return null
  if (!redisClientPromise) {
    redisClientPromise = import('@upstash/redis')
      .then(({ Redis }) => new Redis({ url: credentials.url, token: credentials.token }) as unknown as GuardRedisClient)
      .catch((error) => {
        redisClientPromise = null
        logger.warn('email-send-guard: Upstash client unavailable', {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      })
  }
  return redisClientPromise
}

function redisStore(redis: GuardRedisClient): GuardStore {
  return {
    async setIfAbsent(key, ttlSeconds) {
      const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds })
      return result !== null
    },
    async increment(key, ttlSeconds) {
      const raw = await redis.incr(key)
      const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
      if (!Number.isFinite(value)) throw new Error('Unexpected incr response')
      if (value === 1) await redis.expire(key, ttlSeconds)
      return value
    },
  }
}

export function getMailDailyBudget(): number {
  const raw = process.env.EMAIL_DAILY_SEND_BUDGET
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAIL_DAILY_BUDGET
}

function addressDigest(address: string): string {
  return createHash('sha256').update(address.trim().toLowerCase()).digest('hex').slice(0, 32)
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

async function decide(
  store: GuardStore,
  kind: TransactionalMailKind,
  address: string,
  now: Date
): Promise<MailSendDecision> {
  const digest = addressDigest(address)
  const day = utcDay(now)

  const cooldownFree = await store.setIfAbsent(
    `mail_guard:cooldown:${kind}:${digest}`,
    MAIL_ADDRESS_COOLDOWN_SECONDS,
    now.getTime()
  )
  if (!cooldownFree) return { allowed: false, reason: 'address_cooldown' }

  const sentToAddressToday = await store.increment(
    `mail_guard:address_day:${kind}:${digest}:${day}`,
    DAY_TTL_SECONDS,
    now.getTime()
  )
  if (sentToAddressToday > MAIL_ADDRESS_DAILY_MAX) {
    return { allowed: false, reason: 'address_daily_cap' }
  }

  const sentToday = await store.increment(`mail_guard:budget:${day}`, DAY_TTL_SECONDS, now.getTime())
  if (sentToday > getMailDailyBudget()) return { allowed: false, reason: 'daily_budget' }

  return { allowed: true }
}

let lastBudgetEventAt = 0

async function reportBudgetReached(kind: TransactionalMailKind): Promise<void> {
  const now = Date.now()
  if (now - lastBudgetEventAt < BUDGET_EVENT_INTERVAL_MS) return
  lastBudgetEventAt = now
  logger.warn('Transactional mail daily budget reached; sends are refused until 00:00 UTC', {
    kind,
    budget: getMailDailyBudget(),
  })
  try {
    const { recordServerReliabilityEvent } = await import('./server-operational-events')
    await recordServerReliabilityEvent({
      eventName: 'email_send_budget_reached',
      source: kind,
      payload: { budget: getMailDailyBudget() },
    })
  } catch {
    // Bookkeeping must never fail the request.
  }
}

/**
 * Reserve one transactional send to `address`. Call it before rotating any token, so a
 * refused request leaves the link already in the recipient's inbox valid.
 */
export async function reserveTransactionalMailSend(
  kind: TransactionalMailKind,
  address: string,
  now: Date = new Date()
): Promise<MailSendDecision> {
  let decision: MailSendDecision
  const redis = await getRedisClient()
  if (redis) {
    try {
      decision = await decide(redisStore(redis), kind, address, now)
    } catch (error) {
      logger.warn('email-send-guard: shared store failed, using the per-instance store', {
        error: error instanceof Error ? error.message : String(error),
      })
      decision = await decide(memoryStore, kind, address, now)
    }
  } else {
    decision = await decide(memoryStore, kind, address, now)
  }

  if (!decision.allowed && decision.reason === 'daily_budget') {
    await reportBudgetReached(kind)
  }
  return decision
}

export const __emailSendGuardTestUtils = {
  reset() {
    memory.clear()
    redisClientPromise = null
    lastBudgetEventAt = 0
  },
}
