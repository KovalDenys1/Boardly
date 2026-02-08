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
    const guestId = req.headers.get('X-Guest-Id')
    const userId = session?.user?.id || guestId

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { gameId } = await params

    // Find the game with its lobby and players
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: {
        lobby: true,
        players: {
          include: {
            user: {
              include: {
                bot: true  // Include bot relation
              }
            }
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
    const isCreator = game.lobby.creatorId === userId
    const isPlayer = game.players.some(p => p.userId === userId)

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
    const humanPlayersCount = game.players.filter(p => !p.user.bot).length

    // Mark game as abandoned
    await prisma.games.update({
      where: { id: gameId },
      data: {
        status: 'abandoned',
        abandonedAt: new Date() as any // TypeScript cache issue - field exists in schema
      }
    })

    log.info('Game abandoned manually', {
      gameId,
      userId,
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
