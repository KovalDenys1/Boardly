import { NextRequest, NextResponse } from 'next/server'
import { recordCronRun } from '@/lib/cron-heartbeat'
import { apiLogger } from '@/lib/logger'
import { cleanupUnverifiedAccounts, warnUnverifiedAccounts } from '@/lib/cleanup-unverified'
import { cleanupOldGuests } from '@/scripts/cleanup-old-guests'
import { cleanupOldReplaySnapshots, cleanupOversizedReplaySnapshots } from '@/lib/cleanup-replays'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'
import { enforceRetention } from '@/lib/data-retention'

const log = apiLogger('GET /api/cron/maintenance')

async function handleCronRequest(request: NextRequest) {
  const authError = authorizeCronRequest(request)
  if (authError) return authError

  const startedAt = Date.now()

  try {
    // Consolidated daily maintenance to stay within Vercel cron limits.
    const warningResult = await warnUnverifiedAccounts(2, 7)
    const cleanupUnverifiedResult = await cleanupUnverifiedAccounts(7)
    const guestCleanupResult = await cleanupOldGuests({ disconnect: false })
    const replayCleanupResult = await cleanupOldReplaySnapshots()
    const replayOverflowResult = await cleanupOversizedReplaySnapshots()
    const lobbyCleanupResult = await cleanupStaleLobbiesAndGames()
    // Retention periods (#1130) run last, so a game the stale sweep has just closed is
    // judged by the endedAt it was given a moment ago.
    const retentionResult = await enforceRetention()
    // The heartbeat payload is flat: per rule, what was deleted, or in report mode what
    // would have been, so a report-only rule leaves its daily count in cron_run.
    const retentionSummary: Record<string, number | boolean> = {}
    for (const [key, entry] of Object.entries(retentionResult)) {
      retentionSummary[`retention_${key}_enforced`] = entry.enforced
      retentionSummary[`retention_${key}_${entry.enforced ? 'deleted' : 'matched'}`] = entry.error ? -1 : entry.matched
    }

    await recordCronRun({
      cron: 'maintenance',
      success: true,
      latencyMs: Date.now() - startedAt,
      payload: {
        deletedGuests: guestCleanupResult.deleted,
        deletedUnverified: cleanupUnverifiedResult.deleted,
        cancelledWaitingGames: lobbyCleanupResult.cancelledWaitingGames,
        ...retentionSummary,
      },
    })

    return NextResponse.json({
      success: true,
      warned: warningResult.warned,
      deletedUnverified: cleanupUnverifiedResult.deleted,
      deletedGuests: guestCleanupResult.deleted,
      deletedReplaySnapshots: replayCleanupResult.deleted,
      deactivatedLobbies: lobbyCleanupResult.deactivatedLobbies,
      cancelledWaitingGames: lobbyCleanupResult.cancelledWaitingGames,
      abandonedPlayingGames: lobbyCleanupResult.abandonedPlayingGames,
      // Above zero means some start path is leaving the move clock unstamped (#1048).
      playingGamesWithPreStartMoveClock: lobbyCleanupResult.playingGamesWithPreStartMoveClock,
      replayRetentionDays: replayCleanupResult.retentionDays,
      replayCutoffDate: replayCleanupResult.cutoffDate,
      deletedOversizedReplaySnapshots: replayOverflowResult.deletedSnapshots,
      oversizedReplayGames: replayOverflowResult.affectedGames,
      retention: retentionResult,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Maintenance cron failed', error as Error)
    await recordCronRun({
      cron: 'maintenance',
      success: false,
      latencyMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    })
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
