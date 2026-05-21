import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const kickPlayerSchema = z.object({
  playerId: z.string().uuid(),
})

const limiter = rateLimit(rateLimitPresets.api)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const log = apiLogger('POST /api/lobby/[code]/kick-player')
  try {
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    const body = kickPlayerSchema.safeParse(await request.json())
    if (!body.success) {
      return NextResponse.json({ error: 'Invalid playerId' }, { status: 400 })
    }
    const { playerId } = body.data

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          where: { status: 'waiting' },
          include: {
            players: {
              include: { user: true },
            },
          },
          take: 1,
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== userId) {
      return NextResponse.json({ error: 'Only the host can kick players' }, { status: 403 })
    }

    const waitingGame = lobby.games[0]
    if (!waitingGame) {
      return NextResponse.json({ error: 'No waiting game found' }, { status: 400 })
    }

    const targetPlayer = waitingGame.players.find((p) => p.id === playerId)
    if (!targetPlayer) {
      return NextResponse.json({ error: 'Player not found in lobby' }, { status: 404 })
    }

    if (targetPlayer.userId === userId) {
      return NextResponse.json({ error: 'Cannot kick yourself' }, { status: 400 })
    }

    await prisma.players.delete({ where: { id: playerId } })

    const remainingCount = waitingGame.players.length - 1

    void broadcastToLobby(code, 'player-kicked', {
      lobbyCode: code,
      userId: targetPlayer.userId,
      username: targetPlayer.user.username || targetPlayer.user.email || 'Player',
      remainingCount,
    })

    void broadcastToLobby(code, 'player-left', {
      lobbyCode: code,
      userId: targetPlayer.userId,
      username: targetPlayer.user.username,
      remainingCount,
      kicked: true,
    })

    return NextResponse.json({ success: true, message: 'Player kicked' })
  } catch (error) {
    log.error('Error kicking player', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
