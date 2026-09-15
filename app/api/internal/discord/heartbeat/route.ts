import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiLogger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { authorizeDiscordInternalRequest } from '@/lib/discord/internal-auth'
import { DISCORD_BOT_HEARTBEAT_SOURCE } from '@/lib/operational-metrics'

const log = apiLogger('POST /api/internal/discord/heartbeat')

// The bot posts every 5 minutes; 12 per minute leaves room for a restart loop without
// letting a stuck client fill OperationalEvents.
const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 12,
  message: 'Too many heartbeats.',
})

const heartbeatSchema = z
  .object({
    sha: z.string().trim().min(1).max(64).optional(),
    ready: z.boolean().optional(),
    uptimeSeconds: z.number().int().min(0).optional(),
    latencyMs: z.number().min(0).max(60 * 60 * 1000).optional(),
    guildMembers: z.number().int().min(0).optional(),
  })
  .strict()

/**
 * The Discord bot's liveness row.
 *
 * Writes a `cron_run` event with `source = "discord-bot"` through `recordCronRun`, the
 * same row the site's own crons write, so the `discord_bot_stale` reliability rule can
 * treat a silent bot like a silent cron. The body is optional context for the row's
 * payload; an empty body is a valid heartbeat.
 */
export async function POST(request: NextRequest) {
  const authError = authorizeDiscordInternalRequest(request)
  if (authError) return authError

  const rateLimitResponse = await heartbeatLimiter(request)
  if (rateLimitResponse) return rateLimitResponse

  const rawBody: unknown = await request.json().catch(() => ({}))
  const parsed = heartbeatSchema.safeParse(rawBody ?? {})
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid heartbeat', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { sha, ready, uptimeSeconds, latencyMs, guildMembers } = parsed.data
  const recordedAt = new Date()

  try {
    await recordCronRun({
      cron: DISCORD_BOT_HEARTBEAT_SOURCE,
      success: ready ?? true,
      latencyMs: latencyMs ?? 0,
      reason: ready === false ? 'gateway_not_ready' : undefined,
      payload: {
        sha: sha ?? null,
        uptimeSeconds: uptimeSeconds ?? null,
        guildMembers: guildMembers ?? null,
      },
    })
  } catch (error) {
    // recordCronRun never throws, but a heartbeat must not fail on bookkeeping either.
    log.error('Discord heartbeat could not be recorded', error as Error)
  }

  return NextResponse.json({ ok: true, recordedAt: recordedAt.toISOString() })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
