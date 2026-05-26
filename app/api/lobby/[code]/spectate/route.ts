import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { sanitizeLobbyCreatorIdentity, sanitizeLobbyUserIdentity } from '@/lib/lobby-response'
import { sanitizeGameStateForSpectator } from '@/lib/spectator-state'
import { getRequestAuthUser } from '@/lib/request-auth'

const apiLimiter = rateLimit(rateLimitPresets.api)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await apiLimiter(request)
  if (rateLimitResult) return rateLimitResult

  const { code } = await params
  const includeFinished = new URL(request.url).searchParams.get('includeFinished') === 'true'

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
      creator: {
        select: {
          id: true,
          username: true,
        },
      },
      games: {
        where: {
          status: {
            in: includeFinished ? ['waiting', 'playing', 'finished'] : ['waiting', 'playing'],
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
                  isGuest: true,
                  bot: {
                    select: {
                      difficulty: true,
                    },
                  },
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

  if (!lobby.allowSpectators) {
    return NextResponse.json({ error: 'Spectator mode is disabled for this lobby' }, { status: 403 })
  }

  if (lobby.maxSpectators > 0 && lobby.spectatorCount >= lobby.maxSpectators) {
    return NextResponse.json(
      { error: 'Spectator limit reached', code: 'SPECTATOR_LIMIT_REACHED' },
      { status: 403 }
    )
  }

  const activeGame = pickRelevantLobbyGame(lobby.games, { includeFinished })

  // Block players from spectating their own active game
  const requestUser = await getRequestAuthUser(request)
  if (requestUser && activeGame && Array.isArray(activeGame.players)) {
    const isPlayer = activeGame.players.some((p) => p.user?.id === requestUser.id)
    if (isPlayer) {
      return NextResponse.json(
        { error: 'You are a player in this game', code: 'PLAYER_IN_GAME' },
        { status: 403 }
      )
    }
  }
  const sanitizedActiveGame = activeGame
    ? {
        ...activeGame,
        players: Array.isArray(activeGame.players)
          ? activeGame.players.map((player) => {
              const safeUser = sanitizeLobbyUserIdentity(player?.user)
              return safeUser ? { ...player, user: safeUser } : player
            })
          : activeGame.players,
        state: JSON.stringify(sanitizeGameStateForSpectator(lobby.gameType, activeGame.state, activeGame.status)),
      }
    : null
  const { creator, ...safeLobbyWithoutCreator } = lobby
  const sanitizedCreator = sanitizeLobbyCreatorIdentity(creator)

  const canJoinAsPlayer = (() => {
    const game = activeGame
    if (!game) return false
    const playerCount = Array.isArray(game.players) ? game.players.length : 0
    return playerCount < lobby.maxPlayers
  })()

  return NextResponse.json({
    lobby: {
      ...safeLobbyWithoutCreator,
      creator: sanitizedCreator,
      games: sanitizedActiveGame ? [sanitizedActiveGame] : [],
      activeGame: sanitizedActiveGame,
    },
    activeGame: sanitizedActiveGame,
    canJoinAsPlayer,
  })
}
