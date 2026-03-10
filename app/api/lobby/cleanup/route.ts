import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.api)

export async function POST(req: NextRequest) {
  const log = apiLogger('POST /api/lobby/cleanup')

  try {
    const rateLimitResult = await limiter(req)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const authError = authorizeCronRequest(req)
    if (authError) {
      return authError
    }

    const cleanup = await cleanupStaleLobbiesAndGames()
    log.info('Cleanup completed', cleanup)

    return NextResponse.json({
      message: 'Cleanup completed',
      deactivatedCount: cleanup.deactivatedLobbies,
      cancelledWaitingGames: cleanup.cancelledWaitingGames,
      abandonedPlayingGames: cleanup.abandonedPlayingGames,
      scannedLobbies: cleanup.scannedLobbies,
      scannedActiveGames: cleanup.scannedActiveGames,
    })
  } catch (error: unknown) {
    log.error('Cleanup error', error)

    return NextResponse.json(
      {
        message: 'Cleanup failed',
        deactivatedCount: 0,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
