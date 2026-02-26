import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { cleanupUnverifiedAccounts, warnUnverifiedAccounts } from '@/lib/cleanup-unverified'
import { cleanupOldGuests } from '@/scripts/cleanup-old-guests'

const log = apiLogger('GET /api/cron/maintenance')

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
    // Consolidated daily maintenance to stay within Vercel cron limits.
    const warningResult = await warnUnverifiedAccounts(2, 7)
    const cleanupUnverifiedResult = await cleanupUnverifiedAccounts(7)
    await cleanupOldGuests()

    return NextResponse.json({
      success: true,
      warned: warningResult.warned,
      deletedUnverified: cleanupUnverifiedResult.deleted,
      guestCleanup: 'completed',
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
