import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { syncAllRoleConnections } from '@/lib/discord/role-connection'

const log = apiLogger('/api/cron/discord-role-sync')

// Nightly re-push of Linked Roles metadata (#939): games played and member since move on
// their own, premium is pushed by the Stripe webhook but a missed event must still converge.
// Triggered by .github/workflows/discord-role-sync-cron.yml at 04:00 UTC. Rows without the
// scope or without a token never leave the database (see syncAllRoleConnections); a grant
// Discord rejects has its tokens dropped, so it is not asked about again tomorrow.
async function handleCronRequest(request: NextRequest) {
  const authError = authorizeCronRequest(request)
  if (authError) return authError

  const startedAt = Date.now()

  try {
    const summary = await syncAllRoleConnections({ batchSize: 50, deadlineMs: 40_000 })

    log.info('Discord role sync finished', summary)

    // Heartbeat on the way out so a job that stops running is visible (#897). Awaited, never throws.
    await recordCronRun({
      cron: 'discord-role-sync',
      success: true,
      latencyMs: Date.now() - startedAt,
      payload: summary,
    })

    return NextResponse.json({ success: true, ...summary, timestamp: new Date().toISOString() })
  } catch (error) {
    log.error('Discord role sync failed', error as Error)
    await recordCronRun({
      cron: 'discord-role-sync',
      success: false,
      latencyMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    })
    return NextResponse.json(
      { error: 'Discord role sync failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request)
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
