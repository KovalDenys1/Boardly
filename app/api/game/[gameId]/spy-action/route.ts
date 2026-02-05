import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { SpyGame } from '@/lib/games/spy-game'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.game)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('POST /api/game/[gameId]/spy-action')

  try {
    const { gameId } = await params
    
    // Get session or guest user
    const session = await getServerSession(authOptions)
    const guestId = request.headers.get('X-Guest-Id')
    const guestName = request.headers.get('X-Guest-Name')

    const userId = session?.user?.id || guestId
    const username = session?.user?.name || guestName || 'Guest'

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, data } = await request.json()

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 })
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
        lobby: true,
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

    // Build move object
    const move = {
      playerId: userId,
      type: action,
      data: data || {},
      timestamp: new Date(),
    }

    // Validate and process move
    if (!spyGame.validateMove(move)) {
      log.warn('Invalid Spy game move', { userId, action, gameId })
      return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    }

    spyGame.processMove(move)

    // Get updated state
    const updatedState = spyGame.getState()

    // Update game in database
    await prisma.games.update({
      where: { id: gameId },
      data: {
        state: JSON.stringify(updatedState),
        updatedAt: new Date(),
        lastMoveAt: new Date(),
      },
    })

    log.info('Spy game action processed', { userId, action, gameId })

    // Notify all clients via WebSocket
    await notifySocket(`lobby:${game.lobby.code}`, 'spy-action', {
      action,
      playerId: userId,
      playerName: username,
      data,
      state: updatedState,
    })

    // Also send game-update for consistency
    await notifySocket(`lobby:${game.lobby.code}`, 'game-update', {
      action: 'spy-action',
      payload: { state: updatedState },
    })

    return NextResponse.json({
      success: true,
      state: updatedState,
    })
  } catch (err) {
    log.error('Error processing Spy game action', err as Error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
