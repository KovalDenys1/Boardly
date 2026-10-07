import { prisma } from './db'
import { logger } from './logger'
import type { ServerOperationalEventName } from './operational-events'

/**
 * One `bot_turn_applied` row per bot turn, written by POST /api/game/[gameId]/bot-turn.
 *
 * `move_submit_applied` measures a person's move from the client, so nothing measured how
 * long a player waits for the bot's reply. `latencyMs` runs from the moment the turn became
 * the bot's (the state route's `triggeredAt`, right after the human's move committed, or the
 * bot-turn request's own arrival when nothing upstream stamped it) to the bot's first commit
 * being handed to Supabase Realtime, so it holds the trigger hop, the bot's pause, its search
 * and the database write. Realtime delivery to the browser is not in it. `payload.turn_ms`
 * covers the whole turn, which is longer than `latencyMs` in the games that commit several
 * times per turn (Yahtzee, Memory, Ludo, a Checkers capture chain).
 *
 * Server-only, like `cron_run`: absent from OPERATIONAL_EVENT_NAMES, so the public beacon
 * cannot forge it. Never throws.
 */
export interface BotTurnTiming {
  gameType: string
  difficulty: string
  source: string
  success: boolean
  turnStartedAt: number
  firstCommitAt: number | null
  lastCommitAt: number | null
  commits: number
  reason?: string
}

export function buildBotTurnAppliedRecord(timing: BotTurnTiming) {
  const toMs = (at: number | null) =>
    at === null ? null : Math.max(0, Math.round(at - timing.turnStartedAt))
  return {
    eventName: 'bot_turn_applied' satisfies ServerOperationalEventName,
    metricType: 'latency',
    gameType: timing.gameType,
    success: timing.success,
    latencyMs: toMs(timing.firstCommitAt),
    source: timing.source.slice(0, 64),
    reason: timing.reason?.slice(0, 200),
    payload: {
      difficulty: timing.difficulty,
      commits: timing.commits,
      turn_ms: toMs(timing.lastCommitAt),
    },
  }
}

export async function recordBotTurnApplied(timing: BotTurnTiming): Promise<void> {
  try {
    await prisma.operationalEvents.create({ data: buildBotTurnAppliedRecord(timing) })
  } catch (err) {
    logger.warn('Failed to record bot_turn_applied', {
      gameType: timing.gameType,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
