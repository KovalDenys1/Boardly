import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { decodeGameReplaySnapshots } from '@/lib/game-replay'
import { parsePersistedGameState } from '@/lib/persisted-game-state'

function shouldDownloadReplay(value: string | null): boolean {
  if (!value) return false
  return value === '1' || value.toLowerCase() === 'true'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('GET /api/game/[gameId]/replay')

  try {
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { gameId } = await params
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: {
        lobby: {
          select: {
            code: true,
            name: true,
            gameType: true,
          },
        },
        players: {
          select: {
            userId: true,
            user: {
              select: {
                username: true,
                bot: true,
              },
            },
          },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const isPlayer = game.players.some((player) => player.userId === userId)
    if (!isPlayer) {
      return NextResponse.json(
        { error: 'You are not a player in this game' },
        { status: 403 }
      )
    }

    const rawSnapshots = await prisma.gameStateSnapshots.findMany({
      where: { gameId: game.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        turnNumber: true,
        playerId: true,
        actionType: true,
        actionPayload: true,
        stateCompressed: true,
        stateEncoding: true,
        createdAt: true,
      },
    })

    const snapshots = decodeGameReplaySnapshots(rawSnapshots)
    const replaySnapshots =
      snapshots.length > 0
        ? snapshots
        : [
            {
              id: `fallback-${game.id}`,
              turnNumber: 0,
              playerId: null,
              actionType: 'game:final-state',
              actionPayload: null,
              state: parsePersistedGameState(game.state),
              createdAt: game.updatedAt.toISOString(),
            },
          ]

    const resolvedGameType = game.lobby.gameType || game.gameType

    const replayPayload = {
      game: {
        id: game.id,
        lobbyCode: game.lobby.code,
        lobbyName: game.lobby.name,
        gameType: resolvedGameType,
        status: game.status,
        createdAt: game.createdAt.toISOString(),
        updatedAt: game.updatedAt.toISOString(),
        players: game.players.map((player) => ({
          userId: player.userId,
          username: player.user.username ?? null,
          isBot: !!player.user.bot,
        })),
      },
      replay: {
        count: replaySnapshots.length,
        snapshots: replaySnapshots,
      },
    }

    if (shouldDownloadReplay(new URL(request.url).searchParams.get('download'))) {
      return new NextResponse(JSON.stringify(replayPayload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename=\"replay-${game.id}.json\"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json(replayPayload)
  } catch (error) {
    log.error('Error fetching game replay', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
