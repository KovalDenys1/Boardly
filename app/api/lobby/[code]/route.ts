import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    
    const lobby = await prisma.lobby.findUnique({
      where: { code },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        games: {
          where: { status: { in: ['waiting', 'playing'] } },
          include: {
            players: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                    isBot: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    return NextResponse.json({ lobby })
  } catch (error) {
    const log = apiLogger('GET /api/lobby/[code]')
    log.error('Get lobby error', error as Error, {
      code: (await params).code,
      stack: (error as Error).stack
    })
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const lobby = await prisma.lobby.findUnique({
      where: { code },
      include: {
        games: {
          where: { status: { in: ['waiting', 'playing'] } },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    // Check password if set
    const body = await request.json()
    if (lobby.password && body.password !== lobby.password) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
    }

    // Find or create active game
    let game = lobby.games.find((g) => g.status === 'waiting')

    if (!game) {
      // Create new game with initial Yahtzee state
      const initialState = {
        round: 0,
        currentPlayerIndex: 0, // Start with first player
        dice: [1, 1, 1, 1, 1],
        held: [false, false, false, false, false],
        rollsLeft: 3,
        scores: [], // Will be initialized when players join
        finished: false,
      }
      
      game = await prisma.game.create({
        data: {
          lobbyId: lobby.id,
          state: JSON.stringify(initialState),
          status: 'waiting',
        },
      })
    }

    // Check if player already joined
    const existingPlayer = await prisma.player.findUnique({
      where: {
        gameId_userId: {
          gameId: game.id,
          userId: session.user.id,
        },
      },
    })

    if (existingPlayer) {
      return NextResponse.json({ game, player: existingPlayer })
    }

    // Count current players
    const playerCount = await prisma.player.count({
      where: { gameId: game.id },
    })

    if (playerCount >= lobby.maxPlayers) {
      return NextResponse.json(
        { error: 'Lobby is full' },
        { status: 400 }
      )
    }

    // Add player to game
    const player = await prisma.player.create({
      data: {
        gameId: game.id,
        userId: session.user.id,
        position: playerCount,
        scorecard: JSON.stringify({}),
      },
    })

    // Initialize scores array in game state for this player
    try {
      const currentState = JSON.parse(game.state || '{}')
      if (!currentState.scores || !Array.isArray(currentState.scores)) {
        currentState.scores = []
      }
      // Add empty scorecard for new player
      currentState.scores.push({})
      
      await prisma.game.update({
        where: { id: game.id },
        data: {
          state: JSON.stringify(currentState),
        },
      })
    } catch (error) {
      const log = apiLogger('POST /api/lobby/[code]')
      log.error('Error updating game state with new player scores', error as Error)
      // Continue anyway - game state will be initialized on game start
    }

    // Notify all clients via WebSocket that a player joined
    await notifySocket(
      `lobby:${code}`,
      'player-joined',
      {
        username: session.user.name || session.user.email || 'Player',
        userId: session.user.id,
      }
    )

    // Also send lobby-update event
    await notifySocket(
      `lobby:${code}`,
      'lobby-update',
      { lobbyCode: code }
    )

    return NextResponse.json({ game, player })
  } catch (error) {
    const log = apiLogger('POST /api/lobby/[code]')
    log.error('Join lobby error', error as Error, {
      code: (await params).code,
      stack: (error as Error).stack
    })
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    }, { status: 500 })
  }
}
