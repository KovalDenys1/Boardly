import { NextResponse } from 'next/server'
import { cleanupOldGuests } from '@/scripts/cleanup-old-guests'
import { apiLogger } from '@/lib/logger'
import { authorizeCronRequest } from '@/lib/cron-auth'

/**
 * Cron endpoint for cleaning up old guest users
 * Vercel Cron: Runs daily at 3 AM UTC
 * 
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/cleanup-guests",
 *     "schedule": "0 3 * * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  const log = apiLogger('GET /api/cron/cleanup-guests')
  
  try {
    const authError = authorizeCronRequest(request)
    if (authError) {
      log.error('Unauthorized cron request')
      return authError
    }
    
    log.info('Starting guest cleanup cron job')
    
    await cleanupOldGuests()
    
    log.info('Guest cleanup completed successfully')
    
    return NextResponse.json({
      success: true,
      message: 'Guest cleanup completed',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Guest cleanup cron failed', error as Error)
    return NextResponse.json(
      {
        success: false,
        error: 'Cleanup failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

// Allow manual trigger in development
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
