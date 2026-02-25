import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { processNotificationEmailQueue } from '@/lib/notification-queue'

const log = apiLogger('GET /api/cron/process-notifications')

async function handleCronRequest(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET

    if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await processNotificationEmailQueue({
      baseUrl: new URL(request.url).origin,
    })

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Notification queue cron failed', error as Error)
    return NextResponse.json(
      {
        error: 'Notification queue cron failed',
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
