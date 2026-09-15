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

/**
 * The body the bot actually sends, key for key.
 *
 * `boardly-discord/bot/lib/boardly-api.ts:138` posts
 * `{ memberCount, openPosts, uptimeS, sha }` every five minutes from
 * `bot/health.ts:96`, and `ready` is being added there in the same sitting. Strict on
 * purpose, but strict only pays for itself if it is strict about the right keys: the
 * first version of this route named three of them differently, so every heartbeat would
 * have been a 400 the bot logged as a warning and nobody read - and `discord_bot_stale`
 * stays quiet until a first heartbeat lands, so the site would have said nothing either.
 */
const heartbeatSchema = z
  .object({
    memberCount: z.number().int().min(0).optional(),
    openPosts: z.number().int().min(0).optional(),
    uptimeS: z.number().int().min(0).optional(),
    sha: z.string().trim().min(1).max(64).optional(),
    ready: z.boolean().optional(),
  })
  .strict()

/**
 * The Discord bot's liveness row.
 *
 * Writes a `cron_run` event with `source = "discord-bot"` through `recordCronRun`, the
 * same row the site's own crons write, so the `discord_bot_stale` reliability rule can
 * treat a silent bot like a silent cron. Every field is optional context for the row's
 * payload; an empty body is a valid heartbeat, and a missing `ready` counts as ready.
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

  const { memberCount, openPosts, uptimeS, sha, ready } = parsed.data
  const recordedAt = new Date()

  try {
    await recordCronRun({
      cron: DISCORD_BOT_HEARTBEAT_SOURCE,
      success: ready ?? true,
      // A heartbeat reports no work, so there is no duration to record.
      latencyMs: 0,
      reason: ready === false ? 'gateway_not_ready' : undefined,
      payload: {
        sha: sha ?? null,
        memberCount: memberCount ?? null,
        // The count of open looking-for-players threads, which is the only view the
        // site gets of the feed the bot maintains.
        openPosts: openPosts ?? null,
        uptimeS: uptimeS ?? null,
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
