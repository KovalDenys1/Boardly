import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { sendSocialInviteEmail } from '@/lib/email'
import { SocketEvents, SocketRooms } from '@/types/socket-events'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
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
                user: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                  },
                },
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

    const participants = Array.from(
      new Map(
        latestGame.players.map((player) => [
          player.userId,
          {
            id: player.userId,
            username: player.user?.username || null,
            email: player.user?.email || null,
          },
        ])
      ).values()
    )
    const participantIds = participants.map((participant) => participant.id)

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
    const targetUserIds = isCreator
      ? participantIds.filter((userId) => userId !== requestUser.id)
      : [lobby.creatorId]

    const dedupedTargetUserIds = Array.from(new Set(targetUserIds)).filter(Boolean)

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

    const participantById = new Map(participants.map((participant) => [participant.id, participant]))
    await Promise.allSettled(
      dedupedTargetUserIds.map((userId) => {
        const recipient = participantById.get(userId)
        if (!recipient?.email) {
          return Promise.resolve({ success: false, error: 'Missing recipient email' })
        }

        return sendSocialInviteEmail({
          email: recipient.email,
          recipientName: recipient.username,
          senderName: requestUser.username,
          lobbyName: lobby.name,
          gameType: lobby.gameType,
          inviteUrl,
          type: 'rematch',
        })
      })
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
