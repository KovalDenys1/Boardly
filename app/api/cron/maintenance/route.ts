import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { cleanupUnverifiedAccounts, warnUnverifiedAccounts } from '@/lib/cleanup-unverified'
import { cleanupOldGuests } from '@/scripts/cleanup-old-guests'
import { cleanupOldReplaySnapshots } from '@/lib/cleanup-replays'
import { authorizeCronRequest } from '@/lib/cron-auth'

const log = apiLogger('GET /api/cron/maintenance')

async function handleCronRequest(request: NextRequest) {
  const authError = authorizeCronRequest(request)
  if (authError) return authError

  try {
    // Consolidated daily maintenance to stay within Vercel cron limits.
    const warningResult = await warnUnverifiedAccounts(2, 7)
    const cleanupUnverifiedResult = await cleanupUnverifiedAccounts(7)
    const guestCleanupResult = await cleanupOldGuests({ disconnect: false })
    const replayCleanupResult = await cleanupOldReplaySnapshots()

    return NextResponse.json({
      success: true,
      warned: warningResult.warned,
      deletedUnverified: cleanupUnverifiedResult.deleted,
      deletedGuests: guestCleanupResult.deleted,
      deletedReplaySnapshots: replayCleanupResult.deleted,
      replayRetentionDays: replayCleanupResult.retentionDays,
      replayCutoffDate: replayCleanupResult.cutoffDate,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Maintenance cron failed', error as Error)
    return NextResponse.json(
      {
        error: 'Maintenance cron failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
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
