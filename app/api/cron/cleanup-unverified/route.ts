import { NextRequest, NextResponse } from 'next/server'
import { cleanupUnverifiedAccounts, warnUnverifiedAccounts } from '@/lib/cleanup-unverified'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/api/cron/cleanup-unverified')

// This endpoint should be called by a cron service (e.g., Vercel Cron, external cron job)
// Protect it with a secret token
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || process.env.JWT_SECRET

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      log.error('Unauthorized cron request', undefined, {
        hasAuth: !!authHeader,
        ip: req.headers.get('x-forwarded-for') || 'unknown'
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    log.info('Starting scheduled cleanup of unverified accounts')

    // Send warnings first (2 days before deletion)
    const warningResult = await warnUnverifiedAccounts(2, 7)
    
    // Then cleanup accounts older than 7 days
    const cleanupResult = await cleanupUnverifiedAccounts(7)

    log.info('Cleanup completed', {
      warned: warningResult.warned,
      deleted: cleanupResult.deleted
    })

    return NextResponse.json({
      success: true,
      warned: warningResult.warned,
      deleted: cleanupResult.deleted,
      warnedUsers: warningResult.users,
      deletedUsers: cleanupResult.users,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    log.error('Error in cleanup cron job', error as Error)
    return NextResponse.json(
      { 
        error: 'Cleanup failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Allow POST as well for manual triggers
export async function POST(req: NextRequest) {
  return GET(req)
}
