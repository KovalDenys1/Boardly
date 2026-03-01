import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { sanitizeGameStateForSpectator } from '@/lib/spectator-state'

const apiLimiter = rateLimit(rateLimitPresets.api)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await apiLimiter(request)
  if (rateLimitResult) return rateLimitResult

  const requestUser = await getRequestAuthUser(request)
  if (!requestUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
                  bot: true,
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

  const activeGame = pickRelevantLobbyGame(lobby.games as any[], { includeFinished }) as any | null
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
        state: JSON.stringify(sanitizeGameStateForSpectator(lobby.gameType, activeGame.state)),
      }
    : null
  const { creator, ...safeLobbyWithoutCreator } = lobby
  const sanitizedCreator = creator
    ? (({ email: _email, ...safeCreator }: { email?: string; [key: string]: unknown }) => safeCreator)(creator as any)
    : null

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
