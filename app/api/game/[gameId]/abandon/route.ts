import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.game)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const log = apiLogger('POST /api/game/[gameId]/abandon')

  try {
    const requestUser = await getRequestAuthUser(req)
    const userId = requestUser?.id

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
    const now = new Date()
    const startedAt = (game as unknown as { startedAt?: Date | null }).startedAt
    const durationSeconds =
      startedAt instanceof Date ? Math.floor((now.getTime() - startedAt.getTime()) / 1000) : null
    await prisma.games.update({
      where: { id: gameId },
      data: {
        status: 'abandoned',
        abandonedAt: now,
        endedAt: now,
        ...(durationSeconds !== null ? { durationSeconds } : {}),
        terminalMetadata: { outcome: 'abandoned', reason: 'manual' },
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
  } catch (error: unknown) {
    log.error('Abandon game error', error)
    return NextResponse.json(
      { error: 'Failed to abandon game' },
      { status: 500 }
    )
  }
}
