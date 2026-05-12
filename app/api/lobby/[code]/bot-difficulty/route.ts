import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { normalizeBotDifficulty, getBotDisplayName } from '@/lib/bot-profiles'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const log = apiLogger('PATCH /api/lobby/[code]/bot-difficulty')
  try {
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    const { botPlayerId, difficulty } = await request.json() as {
      botPlayerId?: string
      difficulty?: string
    }

    if (!botPlayerId || !difficulty) {
      return NextResponse.json({ error: 'botPlayerId and difficulty are required' }, { status: 400 })
    }

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          where: { status: 'waiting' },
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
      return NextResponse.json({ error: 'Only the lobby creator can change bot difficulty' }, { status: 403 })
    }

    const activeGame = lobby.games[0]
    if (!activeGame) {
      return NextResponse.json({ error: 'No waiting game found' }, { status: 400 })
    }

    const botPlayer = activeGame.players.find((p) => p.id === botPlayerId && p.user?.bot)
    if (!botPlayer) {
      return NextResponse.json({ error: 'Bot player not found' }, { status: 404 })
    }

    const normalizedDifficulty = normalizeBotDifficulty(difficulty)
    const newName = getBotDisplayName(lobby.gameType, normalizedDifficulty)

    // Update bot difficulty and username in place
    await prisma.$transaction([
      prisma.bots.update({
        where: { userId: botPlayer.userId },
        data: { difficulty: normalizedDifficulty },
      }),
      prisma.users.update({
        where: { id: botPlayer.userId },
        data: { username: newName },
      }),
    ])

    void broadcastToLobby(code, 'lobby-update', {
      lobbyCode: code,
      type: 'bot-difficulty-changed',
    })

    return NextResponse.json({
      success: true,
      difficulty: normalizedDifficulty,
      username: newName,
    })
  } catch (error) {
    log.error('Error changing bot difficulty', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
