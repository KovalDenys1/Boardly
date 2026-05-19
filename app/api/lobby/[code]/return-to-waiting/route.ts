import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { broadcastToLobby } from '@/lib/supabase-server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { createGameEngine } from '@/lib/game-registry'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'

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
    const humanPlayers = lastGame.players.filter(p => !p.user?.bot)

    const initialState = createGameEngine(gameType, 'temp').getState()

    const newGame = await prisma.$transaction(async (tx) => {
      const game = await tx.games.create({
        data: {
          lobbyId: lobby.id,
          gameType,
          state: toPersistedGameStateInput(initialState),
          status: 'waiting',
        },
        select: { id: true },
      })

      await tx.players.createMany({
        data: humanPlayers.map((p, i) => ({
          gameId: game.id,
          userId: p.userId,
          position: i,
          scorecard: JSON.stringify({}),
        })),
        skipDuplicates: true,
      })

      return game
    })

    await prisma.lobbies.update({
      where: { id: lobby.id },
      data: { isActive: true },
    })

    await broadcastToLobby(code, 'game-reset', { lobbyCode: code, gameId: newGame.id })

    log.info('Lobby returned to waiting state', { code, gameId: newGame.id, playerCount: humanPlayers.length })

    return NextResponse.json({ success: true, gameId: newGame.id })
  } catch (error: unknown) {
    log.error('Return to waiting error', error)
    return NextResponse.json({ error: 'Failed to return to waiting room' }, { status: 500 })
  }
}
