import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

// This endpoint is called automatically when users visit the lobby page
// No authentication required - it's a public cleanup utility
export async function POST(req: NextRequest) {
  try {
    // Find lobbies with no active games and no players
    const lobbiesWithGames = await prisma.lobby.findMany({
      where: {
        isActive: true,
      },
      include: {
        games: {
          where: {
            OR: [
              { status: 'waiting' },
              { status: 'playing' }
            ]
          },
          include: {
            players: true
          }
        }
      }
    })

    const lobbiesToDeactivate: string[] = []

    for (const lobby of lobbiesWithGames) {
      const activeGame = lobby.games[0]
      
      // If no active game, deactivate lobby
      if (!activeGame) {
        lobbiesToDeactivate.push(lobby.id)
        continue
      }

      // If active game has no players, deactivate lobby
      if (activeGame.players.length === 0) {
        lobbiesToDeactivate.push(lobby.id)
        continue
      }

      // Check if lobby has been inactive for more than 2 hours (reduced from 24)
      const lastUpdated = new Date(activeGame.updatedAt)
      const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceUpdate > 2) {
        lobbiesToDeactivate.push(lobby.id)
      }
    }

    // Deactivate inactive lobbies
    if (lobbiesToDeactivate.length > 0) {
      await prisma.lobby.updateMany({
        where: {
          id: { in: lobbiesToDeactivate }
        },
        data: {
          isActive: false
        }
      })
    }

    return NextResponse.json({
      message: 'Cleanup completed',
      deactivatedCount: lobbiesToDeactivate.length
    })
  } catch (error: any) {
    const log = apiLogger('POST /api/lobby/cleanup')
    log.error('Cleanup error', error)
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    )
  }
}
