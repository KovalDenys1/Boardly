import { prisma } from './db'
import { apiLogger } from './logger'

const log = apiLogger('cron-heartbeat')

/**
 * Records that a scheduled job ran, so a job that stops running is visible.
 *
 * Nothing recorded this before. `game-ops` declares a five-minute schedule and fires six or
 * seven times a day, and the reliability watchdog could not notice, because the watchdog runs
 * inside the cron being watched (#897). A row per run, on both the success and the failure path, is
 * the smallest thing that turns "it is probably fine" into a question with an answer.
 *
 * `cron_run` is deliberately absent from OPERATIONAL_EVENT_NAMES: that array is the zod
 * enum on the public beacon at /api/ops/events, and a forgeable heartbeat would be worse
 * than none.
 *
 * Never throws. A job must not fail because its own bookkeeping did.
 */
export async function recordCronRun(params: {
  cron: string
  success: boolean
  latencyMs: number
  reason?: string
  payload?: Record<string, string | number | boolean | null>
}): Promise<void> {
  try {
    await prisma.operationalEvents.create({
      data: {
        eventName: 'cron_run',
        metricType: 'reliability',
        source: params.cron,
        success: params.success,
        latencyMs: Math.max(0, Math.round(params.latencyMs)),
        reason: params.reason,
        payload: params.payload ?? {},
      },
    })
  } catch (err) {
    log.error(
      'Failed to record a cron heartbeat',
      err instanceof Error ? err : new Error(String(err)),
      { cron: params.cron },
    )
  }
}
