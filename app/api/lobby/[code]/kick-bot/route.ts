import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.api)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const log = apiLogger('POST /api/lobby/[code]/kick-bot')
  try {
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    const { botPlayerId } = await request.json() as { botPlayerId?: string }

    if (!botPlayerId) {
      return NextResponse.json({ error: 'botPlayerId is required' }, { status: 400 })
    }

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          where: { status: { in: ['waiting', 'playing'] } },
          include: {
            players: {
              include: { user: { include: { bot: true } } },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== userId) {
      return NextResponse.json({ error: 'Only the lobby creator can kick bots' }, { status: 403 })
    }

    const activeGame = lobby.games.find((g) => ['waiting', 'playing'].includes(g.status))
    if (!activeGame) {
      return NextResponse.json({ error: 'No active game' }, { status: 400 })
    }

    if (activeGame.status === 'playing') {
      return NextResponse.json({ error: 'Cannot kick bot after game has started' }, { status: 400 })
    }

    const botPlayer = activeGame.players.find((p) => p.id === botPlayerId && p.user?.bot)
    if (!botPlayer) {
      return NextResponse.json({ error: 'Bot player not found' }, { status: 404 })
    }

    await prisma.players.delete({ where: { id: botPlayerId } })

    void broadcastToLobby(code, 'player-left', {
      lobbyCode: code,
      userId: botPlayer.userId,
      username: botPlayer.user?.username,
      isBot: true,
      remainingCount: activeGame.players.length - 1,
    })
    // lobby-update handled by Postgres Changes on Lobbies table

    return NextResponse.json({ success: true, message: 'Bot removed' })
  } catch (error) {
    log.error('Error kicking bot', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
