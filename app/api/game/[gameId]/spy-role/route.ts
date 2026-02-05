import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { SpyGame } from '@/lib/games/spy-game'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.api)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('GET /api/game/[gameId]/spy-role')

  try {
    const { gameId } = await params
    
    // Get session or guest user
    const session = await getServerSession(authOptions)
    const guestId = request.headers.get('X-Guest-Id')

    const userId = session?.user?.id || guestId

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch game
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: {
            user: true,
          },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.gameType !== 'guess_the_spy') {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    // Verify player is in this game
    const player = game.players.find((p) => p.userId === userId)
    if (!player) {
      return NextResponse.json({ error: 'Player not in this game' }, { status: 403 })
    }

    // Load game engine
    const spyGame = new SpyGame(gameId)
    spyGame.loadState(JSON.parse(game.state))

    // Get role info for this specific player
    const roleInfo = spyGame.getRoleInfoForPlayer(userId)

    log.info('Player role info retrieved', { userId, gameId })

    return NextResponse.json({
      success: true,
      roleInfo,
    })
  } catch (err) {
    log.error('Error getting player role', err as Error)
    return NextResponse.json(
      { error: 'Failed to get role information' },
      { status: 500 }
    )
  }
}
