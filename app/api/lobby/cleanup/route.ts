import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'

// This endpoint is called automatically when users visit the lobby page
// No authentication required - it's a public cleanup utility
export async function POST(_req: NextRequest) {
  const log = apiLogger('POST /api/lobby/cleanup')
  
  try {
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
  } catch (error: any) {
    log.error('Cleanup error', error)
    
    // Return success even on error - cleanup is not critical
    // This prevents blocking other operations
    return NextResponse.json(
      { 
        message: 'Cleanup skipped due to error', 
        deactivatedCount: 0,
        error: error.message 
      },
      { status: 200 } // Changed from 500 to 200
    )
  }
}
