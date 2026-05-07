import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { createInAppNotification } from '@/lib/in-app-notifications'
import { SocketEvents, SocketRooms } from '@/types/socket-events'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.lobbyCreation)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const log = apiLogger('POST /api/lobby/[code]/rematch')

  try {
    const requestUser = await getRequestAuthUser(request)
    if (!requestUser?.id) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          translationKey: 'errors.unauthorized',
        },
        { status: 401 }
      )
    }

    const { code } = await params
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          include: {
            players: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json(
        {
          error: 'Lobby not found',
          code: 'LOBBY_NOT_FOUND',
          translationKey: 'errors.notFound',
        },
        { status: 404 }
      )
    }

    const latestGame = lobby.games[0]
    if (!latestGame) {
      return NextResponse.json(
        {
          error: 'No games found in lobby',
          code: 'NO_GAMES_IN_LOBBY',
          translationKey: 'toast.rematchNoCompletedGame',
        },
        { status: 400 }
      )
    }

    const participantIds = Array.from(
      new Set(latestGame.players.map((player) => player.userId))
    )

    if (!participantIds.includes(requestUser.id)) {
      return NextResponse.json(
        {
          error: 'Only game participants can request rematch',
          code: 'REMATCH_NOT_PARTICIPANT',
          translationKey: 'toast.rematchNotParticipant',
        },
        { status: 403 }
      )
    }

    const isCreator = lobby.creatorId === requestUser.id
    const targetUserIds: string[] = isCreator
      ? participantIds.filter((userId) => userId !== requestUser.id)
      : lobby.creatorId ? [lobby.creatorId] : []

    const dedupedTargetUserIds = Array.from(new Set(targetUserIds))

    if (dedupedTargetUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        notifiedCount: 0,
        notifiedUserIds: [],
      })
    }

    const origin = new URL(request.url).origin
    const inviteUrl = `${origin}/lobby/${lobby.code}`

    const rematchPayload = {
      lobbyCode: lobby.code,
      lobbyName: lobby.name,
      gameType: lobby.gameType,
      requestedById: requestUser.id,
      requestedByName: requestUser.username,
      inviteUrl,
    }

    await Promise.all(
      dedupedTargetUserIds.map((userId) =>
        notifySocket(
          SocketRooms.user(userId),
          SocketEvents.REMATCH_REQUEST,
          rematchPayload,
          0
        )
      )
    )

    await Promise.allSettled(
      dedupedTargetUserIds.map((userId) =>
        createInAppNotification({
          userId,
          type: 'game_invite',
          dedupeKey: `in_app:game_invite:rematch:${latestGame.id}:recipient:${userId}`,
          payload: {
            lobbyId: lobby.id,
            lobbyCode: lobby.code,
            lobbyName: lobby.name,
            gameType: lobby.gameType,
            gameId: latestGame.id,
            senderId: requestUser.id,
            senderName: requestUser.username || 'Player',
            inviteType: 'rematch',
            href: `/lobby/${lobby.code}`,
          },
        })
      )
    )

    log.info('Rematch request sent', {
      lobbyCode: lobby.code,
      requestedById: requestUser.id,
      notifiedCount: dedupedTargetUserIds.length,
      isCreator,
    })

    return NextResponse.json({
      success: true,
      notifiedCount: dedupedTargetUserIds.length,
      notifiedUserIds: dedupedTargetUserIds,
    })
  } catch (error) {
    log.error('Failed to send rematch request', error as Error)
    return NextResponse.json(
      {
        error: 'Failed to send rematch request',
        code: 'REMATCH_REQUEST_FAILED',
        translationKey: 'toast.rematchRequestFailed',
      },
      { status: 500 }
    )
  }
}
