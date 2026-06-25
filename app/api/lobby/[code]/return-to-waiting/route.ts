import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { transitionLobbyToWaitingRoom } from '@/lib/lobby-series-transition'

const limiter = rateLimit(rateLimitPresets.api)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const log = apiLogger('POST /api/lobby/[code]/return-to-waiting')

  try {
    const rateLimitResult = await limiter(req)
    if (rateLimitResult) return rateLimitResult

    const requestUser = await getRequestAuthUser(req)
    if (!requestUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: { updatedAt: 'desc' },
          include: {
            players: {
              where: { leftAt: null },
              include: { user: { select: { bot: true } } },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== requestUser.id) {
      return NextResponse.json({ error: 'Only the lobby creator can return to waiting room' }, { status: 403 })
    }

    const lastGame = pickRelevantLobbyGame(lobby.games, { includeFinished: true })
    if (!lastGame) {
      return NextResponse.json({ error: 'No game found' }, { status: 404 })
    }

    if (lastGame.status === 'playing' || lastGame.status === 'waiting') {
      return NextResponse.json({ error: 'Cannot return to waiting while game is in progress' }, { status: 409 })
    }

    const gameType = lastGame.gameType || lobby.gameType || 'yahtzee'

    const { gameId } = await transitionLobbyToWaitingRoom({
      lobbyId: lobby.id,
      lobbyCode: code,
      gameType,
      players: lastGame.players,
    })

    log.info('Lobby returned to waiting state', { code, gameId })

    return NextResponse.json({ success: true, gameId })
  } catch (error: unknown) {
    log.error('Return to waiting error', error)
    return NextResponse.json({ error: 'Failed to return to waiting room' }, { status: 500 })
  }
}
