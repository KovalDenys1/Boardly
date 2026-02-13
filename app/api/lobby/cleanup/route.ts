import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'

const WAITING_LOBBY_STALE_HOURS = 1
const ACTIVE_GAME_STALE_HOURS = 2

type CleanupLobbyGame = {
  status: string
  updatedAt: Date
  players: Array<{
    user: {
      bot: unknown
    }
  }>
}

// This endpoint is called automatically when users visit the lobby page
// No authentication required - it's a public cleanup utility
export async function POST(req: NextRequest) {
  const log = apiLogger('POST /api/lobby/cleanup')
  
  try {
    // Find lobbies with no active games and no players
    const lobbiesWithGames = await prisma.lobbies.findMany({
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
            players: {
              include: {
                user: {
                  select: {
                    bot: true,
                  },
                },
              },
            },
          }
        }
      }
    }).catch((dbError) => {
      log.error('Database query failed in cleanup', dbError)
      throw new Error('Database connection error')
    })

    const lobbiesToDeactivate: string[] = []

    for (const lobby of lobbiesWithGames) {
      const activeGame = pickRelevantLobbyGame<CleanupLobbyGame>(lobby.games as CleanupLobbyGame[])
      
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

      // Waiting lobbies with no human players should never stay public.
      const humanPlayers = activeGame.players.filter((player) => !player.user.bot).length
      if (activeGame.status === 'waiting' && humanPlayers === 0) {
        lobbiesToDeactivate.push(lobby.id)
        continue
      }

      // Check inactivity thresholds by status.
      const lastUpdated = new Date(activeGame.updatedAt)
      const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60)

      if (activeGame.status === 'waiting' && hoursSinceUpdate > WAITING_LOBBY_STALE_HOURS) {
        lobbiesToDeactivate.push(lobby.id)
        continue
      }

      if (hoursSinceUpdate > ACTIVE_GAME_STALE_HOURS) {
        lobbiesToDeactivate.push(lobby.id)
      }
    }

    // Deactivate inactive lobbies
    if (lobbiesToDeactivate.length > 0) {
      await prisma.lobbies.updateMany({
        where: {
          id: { in: lobbiesToDeactivate }
        },
        data: {
          isActive: false
        }
      }).catch((updateError) => {
        log.error('Failed to deactivate lobbies', updateError)
        // Don't throw - partial cleanup is OK
      })
    }

    log.info('Cleanup completed', { deactivatedCount: lobbiesToDeactivate.length })
    
    return NextResponse.json({
      message: 'Cleanup completed',
      deactivatedCount: lobbiesToDeactivate.length
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
