import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

/**
 * POST /api/game/[gameId]/abandon
 * 
 * Manually abandon a game (mark as abandoned).
 * Useful for stuck games where all human players have left.
 * Only the creator of the lobby or participants can abandon.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('POST /api/game/[gameId]/abandon')
  
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { gameId } = await params

    // Find the game with its lobby and players
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        lobby: true,
        players: {
          include: {
            user: true
          }
        }
      }
    })

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      )
    }

    // Check if user is the lobby creator or a player in the game
    const isCreator = game.lobby.creatorId === session.user.id
    const isPlayer = game.players.some(p => p.userId === session.user.id)

    if (!isCreator && !isPlayer) {
      return NextResponse.json(
        { error: 'You do not have permission to abandon this game' },
        { status: 403 }
      )
    }

    // Check if game is already finished or abandoned
    if (game.status === 'finished' || game.status === 'abandoned') {
      return NextResponse.json(
        { error: `Game is already ${game.status}` },
        { status: 400 }
      )
    }

    // Count human players still in the game
    const humanPlayersCount = game.players.filter(p => !p.user.isBot).length

    // Mark game as abandoned
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'abandoned',
        abandonedAt: new Date() as any // TypeScript cache issue - field exists in schema
      }
    })

    log.info('Game abandoned manually', {
      gameId,
      userId: session.user.id,
      humanPlayersCount,
      totalPlayers: game.players.length
    })

    return NextResponse.json({
      message: 'Game abandoned successfully',
      gameId,
      humanPlayersLeft: humanPlayersCount
    })
  } catch (error: any) {
    log.error('Abandon game error', error)
    return NextResponse.json(
      { error: 'Failed to abandon game' },
      { status: 500 }
    )
  }
}
