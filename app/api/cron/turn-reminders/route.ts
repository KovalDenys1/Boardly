import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { runTurnReminderCycle } from '@/lib/turn-reminders'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'

const log = apiLogger('GET /api/cron/turn-reminders')

async function handleCronRequest(request: NextRequest) {
  try {
    const authError = authorizeCronRequest(request)
    if (authError) return authError

    const cleanup = await cleanupStaleLobbiesAndGames()
    const result = await runTurnReminderCycle({
      baseUrl: new URL(request.url).origin,
    })

    return NextResponse.json({
      cleanup,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Turn reminder cron failed', error as Error)
    return NextResponse.json(
      {
        error: 'Turn reminder cron failed',
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
