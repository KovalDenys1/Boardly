import { prisma } from './db'
import { logger } from './logger'

/**
 * Server-side reliability signals for the abuse posture (#1150, #1156, #1158).
 *
 * These names are deliberately absent from OPERATIONAL_EVENT_NAMES, which is the zod enum on
 * the public beacon at /api/ops/events: a client that could post `rate_limiter_degraded`
 * could page us at will.
 *
 * Every writer here sits on a path an attacker can drive (a 429, a failed send), so each
 * call site throttles per instance before it gets here; this module only guarantees that
 * bookkeeping never fails the request that triggered it. No IP address or email address is
 * ever written: `source` names the route or the mail kind, `reason` the error.
 */
export const SERVER_RELIABILITY_EVENT_NAMES = [
  'rate_limiter_degraded',
  'rate_limited',
  'email_send_failed',
  'email_send_budget_reached',
] as const

export type ServerReliabilityEventName = (typeof SERVER_RELIABILITY_EVENT_NAMES)[number]

const FIELD_MAX_LENGTH = 200

export async function recordServerReliabilityEvent(params: {
  eventName: ServerReliabilityEventName
  source: string
  reason?: string
  statusCode?: number
  payload?: Record<string, string | number | boolean | null>
}): Promise<void> {
  try {
    await prisma.operationalEvents.create({
      data: {
        eventName: params.eventName,
        metricType: 'reliability',
        source: params.source.slice(0, FIELD_MAX_LENGTH),
        success: false,
        reason: params.reason?.slice(0, FIELD_MAX_LENGTH),
        statusCode: params.statusCode,
        payload: params.payload ?? {},
      },
    })
  } catch (err) {
    logger.warn('Failed to record a server reliability event', {
      eventName: params.eventName,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * A per-instance gate: true at most once per `intervalMs` for each key. An attacker who can
 * trigger an event on every request can then make each warm instance write one row per
 * interval, not one per request.
 */
export function createPerInstanceThrottle(intervalMs: number) {
  const lastAt = new Map<string, number>()
  return (key: string, now: number = Date.now()): boolean => {
    const previous = lastAt.get(key)
    if (previous !== undefined && now - previous < intervalMs) return false
    if (lastAt.size > 1000) lastAt.clear()
    lastAt.set(key, now)
    return true
  }
}
