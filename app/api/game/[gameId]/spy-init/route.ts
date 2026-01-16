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

  const log = apiLogger('POST /api/game/[gameId]/spy-init')

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
    const game = await prisma.game.findUnique({
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

    // Only lobby creator can initialize round
    if (game.lobby.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Only lobby creator can initialize round' },
        { status: 403 }
      )
    }

    // Load game engine
    const spyGame = new SpyGame(gameId)
    spyGame.loadState(JSON.parse(game.state))

    // Check if we're starting a new round (after results) or initializing first round
    const gameData = spyGame.getState().data as any
    if ((gameData?.phase === 'results' || gameData?.phase === 'RESULTS') && gameData?.currentRound < gameData?.totalRounds) {
      // Start next round
      await spyGame.startNextRound()
    } else {
      // Initialize first round (assigns roles, selects location)
      await spyGame.initializeRound()
    }

    // Get updated state
    const updatedState = spyGame.getState()

    // Update game in database
    await prisma.game.update({
      where: { id: gameId },
      data: {
        state: JSON.stringify(updatedState),
        updatedAt: new Date(),
      },
    })

    log.info('Spy game round initialized', { gameId })

    // Notify all clients via WebSocket
    await notifySocket(`lobby:${game.lobby.code}`, 'spy-round-start', {
      state: updatedState,
    })

    return NextResponse.json({
      success: true,
      state: updatedState,
    })
  } catch (err) {
    log.error('Error initializing Spy round', err as Error)
    return NextResponse.json(
      { error: 'Failed to initialize round' },
      { status: 500 }
    )
  }
}
