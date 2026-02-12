import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { createGameEngine, DEFAULT_GAME_TYPE } from '@/lib/game-registry'

const apiLimiter = rateLimit(rateLimitPresets.api)
const gameLimiter = rateLimit(rateLimitPresets.game)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // Rate limit GET requests
    const rateLimitResult = await apiLimiter(request)
    if (rateLimitResult) return rateLimitResult

    const { code } = await params

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        maxPlayers: true,
        turnTimer: true,
        isActive: true,
        gameType: true,
        createdAt: true,
        creatorId: true,
        password: true,
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
                    bot: true,  // Bot relation
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

    const { password, ...safeLobby } = lobby
    return NextResponse.json({
      lobby: {
        ...safeLobby,
        isPrivate: !!password,
      },
    })
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
    // Rate limit join requests
    const rateLimitResult = await gameLimiter(request)
    if (rateLimitResult) return rateLimitResult

    const { code } = await params

    const requestUser = await getRequestAuthUser(request)
    if (!requestUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = requestUser.id

    const lobby = await prisma.lobbies.findUnique({
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
      // Create a new game with initial state from the game registry
      const engine = createGameEngine(lobby.gameType || DEFAULT_GAME_TYPE, 'temp')
      const initialState = engine.getState()

      game = await prisma.games.create({
        data: {
          lobbyId: lobby.id,
          state: JSON.stringify(initialState),
          status: 'waiting',
        },
      })
    }

    // Check if player already joined
    const existingPlayer = await prisma.players.findUnique({
      where: {
        gameId_userId: {
          gameId: game.id,
          userId: userId,
        },
      },
    })

    if (existingPlayer) {
      return NextResponse.json({ game, player: existingPlayer })
    }

    // Count current players
    const playerCount = await prisma.players.count({
      where: { gameId: game.id },
    })

    if (playerCount >= lobby.maxPlayers) {
      return NextResponse.json(
        { error: 'Lobby is full' },
        { status: 400 }
      )
    }

    // Add player to game
    const player = await prisma.players.create({
      data: {
        gameId: game.id,
        userId: userId,
        position: playerCount,
        scorecard: JSON.stringify({}),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            isGuest: true,
          },
        },
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

      await prisma.games.update({
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
        username: player.user.username || player.user.email || 'Player',
        userId: userId,
        isGuest: player.user.isGuest,
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
