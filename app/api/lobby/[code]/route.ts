import { NextRequest, NextResponse } from 'next/server'
import { GameType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { createGameEngine, DEFAULT_GAME_TYPE } from '@/lib/game-registry'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import {
  hashLobbyPassword,
  isHashedLobbyPassword,
  verifyLobbyPassword,
} from '@/lib/lobby-password'

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

    const { searchParams } = new URL(request.url)
    const includeFinished = searchParams.get('includeFinished') === 'true'
    const { code } = await params

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        maxPlayers: true,
        allowSpectators: true,
        maxSpectators: true,
        spectatorCount: true,
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
          },
        },
        games: {
          where: {
            status: {
              in: includeFinished
                ? ['waiting', 'playing', 'finished']
                : ['waiting', 'playing'],
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          include: {
            players: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
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
    const activeGame = pickRelevantLobbyGame(safeLobby.games as any[], { includeFinished }) as any | null
    const sanitizedActiveGame = activeGame
      ? {
          ...activeGame,
          players: Array.isArray(activeGame.players)
            ? activeGame.players.map((player: any) => {
                if (!player?.user || typeof player.user !== 'object') return player
                const { email: _email, ...safeUser } = player.user
                return { ...player, user: safeUser }
              })
            : activeGame.players,
        }
      : null
    const { creator, ...safeLobbyWithoutCreator } = safeLobby
    const sanitizedCreator = creator
      ? (({ email: _email, ...safeCreator }: { email?: string; [key: string]: unknown }) => safeCreator)(creator as any)
      : null

    return NextResponse.json({
      lobby: {
        ...safeLobbyWithoutCreator,
        creator: sanitizedCreator,
        games: sanitizedActiveGame ? [sanitizedActiveGame] : [],
        activeGame: sanitizedActiveGame,
        isPrivate: !!password,
      },
      activeGame: sanitizedActiveGame,
      // Backward compatibility for older clients.
      game: sanitizedActiveGame,
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
  const log = apiLogger('POST /api/lobby/[code]')

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
    if (lobby.password) {
      const providedPassword = typeof body?.password === 'string' ? body.password : undefined
      const isPasswordValid = await verifyLobbyPassword(lobby.password, providedPassword)

      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
      }

      // Upgrade legacy plain-text lobby passwords after a successful match.
      if (!isHashedLobbyPassword(lobby.password)) {
        const upgradedHash = await hashLobbyPassword(providedPassword)
        if (upgradedHash) {
          try {
            await prisma.lobbies.update({
              where: { id: lobby.id },
              data: { password: upgradedHash },
            })
          } catch (upgradeError) {
            log.warn('Failed to upgrade legacy lobby password hash', {
              lobbyId: lobby.id,
              error: (upgradeError as Error).message,
            })
          }
        }
      }
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
          gameType: (lobby.gameType || DEFAULT_GAME_TYPE) as GameType,
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
      await prisma.lobbyInvites.updateMany({
        where: {
          lobbyId: lobby.id,
          inviteeId: userId,
          acceptedAt: null,
        },
        data: {
          acceptedAt: new Date(),
        },
      })
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
            isGuest: true,
          },
        },
      },
    })

    // Notify all clients via WebSocket that a player joined
    await notifySocket(
      `lobby:${code}`,
      'player-joined',
      {
        username: player.user.username || 'Player',
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

    await prisma.lobbyInvites.updateMany({
      where: {
        lobbyId: lobby.id,
        inviteeId: userId,
        acceptedAt: null,
      },
      data: {
        acceptedAt: new Date(),
      },
    })

    return NextResponse.json({ game, player })
  } catch (error) {
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
