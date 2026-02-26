import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { processNotificationEmailQueue } from '@/lib/notification-queue'
import { runTurnReminderCycle } from '@/lib/turn-reminders'

const log = apiLogger('GET /api/cron/game-ops')

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET
  return !!authHeader && !!cronSecret && authHeader === `Bearer ${cronSecret}`
}

async function handleCronRequest(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const baseUrl = new URL(request.url).origin

    // Consolidated frequent cron to stay within Vercel cron limits.
    // Turn reminders are rate-limited per game, so a 5-minute cadence is acceptable.
    const [notifications, turnReminders] = await Promise.all([
      processNotificationEmailQueue({ baseUrl }),
      runTurnReminderCycle({ baseUrl }),
    ])

    return NextResponse.json({
      notifications,
      turnReminders,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Game ops cron failed', error as Error)
    return NextResponse.json(
      {
        error: 'Game ops cron failed',
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
