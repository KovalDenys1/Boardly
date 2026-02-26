import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { sendSocialInviteEmail } from '@/lib/email'
import {
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
} from '@/lib/notification-preferences'
import { recordNotificationDelivery } from '@/lib/notifications-log'
import { SocketEvents, SocketRooms } from '@/types/socket-events'

const inviteSchema = z.object({
  friendIds: z.array(z.string().min(1)).min(1).max(20),
})

type FriendCandidate = {
  id: string
  username: string | null
  email: string | null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const log = apiLogger('POST /api/lobby/[code]/invite')

  try {
    const requestUser = await getRequestAuthUser(request)
    if (!requestUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (requestUser.isGuest) {
      return NextResponse.json(
        { error: 'Guests cannot send friend invites' },
        { status: 403 }
      )
    }

    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const parsedBody = inviteSchema.safeParse(requestBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const { code } = await params
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        gameType: true,
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    const isLobbyMember = await prisma.players.findFirst({
      where: {
        userId: requestUser.id,
        game: {
          lobbyId: lobby.id,
          status: { in: ['waiting', 'playing', 'finished'] },
        },
      },
      select: { id: true },
    })

    if (!isLobbyMember) {
      return NextResponse.json(
        { error: 'Only lobby participants can send invites' },
        { status: 403 }
      )
    }

    const dedupedFriendIds = Array.from(new Set(parsedBody.data.friendIds)).filter(
      (friendId) => friendId !== requestUser.id
    )

    if (dedupedFriendIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid friend IDs to invite' },
        { status: 400 }
      )
    }

    const friendships = await prisma.friendships.findMany({
      where: {
        OR: [
          { user1Id: requestUser.id, user2Id: { in: dedupedFriendIds } },
          { user2Id: requestUser.id, user1Id: { in: dedupedFriendIds } },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    })

    const invitedFriends = new Map<string, FriendCandidate>()
    for (const friendship of friendships) {
      const friend =
        friendship.user1Id === requestUser.id ? friendship.user2 : friendship.user1
      if (dedupedFriendIds.includes(friend.id)) {
        invitedFriends.set(friend.id, {
          id: friend.id,
          username: friend.username,
          email: friend.email,
        })
      }
    }

    if (invitedFriends.size === 0) {
      return NextResponse.json(
        { error: 'Selected users are not your friends' },
        { status: 400 }
      )
    }

    const origin = new URL(request.url).origin
    const inviteUrl = `${origin}/lobby/join/${lobby.code}`

    const invitePayload = {
      lobbyCode: lobby.code,
      lobbyName: lobby.name,
      gameType: lobby.gameType,
      invitedById: requestUser.id,
      invitedByName: requestUser.username,
      inviteUrl,
    }

    await Promise.all(
      Array.from(invitedFriends.values()).map((friend) =>
        notifySocket(
          SocketRooms.user(friend.id),
          SocketEvents.LOBBY_INVITE,
          invitePayload,
          0
        )
      )
    )

    await Promise.allSettled(
      Array.from(invitedFriends.values()).map(async (friend) => {
        const dedupeKey = `game_invite:lobby:${lobby.id}:recipient:${friend.id}`
        const payload = {
          lobbyId: lobby.id,
          lobbyCode: lobby.code,
          lobbyName: lobby.name,
          gameType: lobby.gameType,
          senderId: requestUser.id,
          senderName: requestUser.username || 'Player',
          emailType: 'invite',
        }
        const recipientEmail = friend.email
        if (!recipientEmail) {
          await recordNotificationDelivery({
            userId: friend.id,
            type: 'game_invite',
            status: 'skipped',
            reason: 'missing_recipient_email',
            dedupeKey,
            payload,
          })
          return { success: false, error: 'Missing recipient email' }
        }

        const prefs = await getNotificationPreferences(friend.id)
        if (prefs.unsubscribedAll || !prefs.gameInvites) {
          await recordNotificationDelivery({
            userId: friend.id,
            type: 'game_invite',
            status: 'skipped',
            reason: prefs.unsubscribedAll ? 'unsubscribed_all' : 'game_invites_disabled',
            dedupeKey,
            payload,
          })
          return { success: false, error: 'Recipient disabled game invite emails' }
        }

        const token = createNotificationUnsubscribeToken({
          userId: friend.id,
          type: 'gameInvites',
        })
        const unsubscribeUrl = `${origin}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`

        const emailResult = await sendSocialInviteEmail({
          email: recipientEmail,
          recipientName: friend.username,
          senderName: requestUser.username || 'Player',
          lobbyName: lobby.name,
          gameType: lobby.gameType,
          inviteUrl,
          unsubscribeUrl,
          type: 'invite',
        })

        await recordNotificationDelivery({
          userId: friend.id,
          type: 'game_invite',
          status: emailResult.success ? 'sent' : 'failed',
          reason: emailResult.success ? undefined : 'email_send_failed',
          dedupeKey,
          payload: {
            ...payload,
            recipientEmail,
            providerError: emailResult.success ? undefined : emailResult.error,
          },
        })

        return emailResult
      })
    )

    const invitedFriendIds = Array.from(invitedFriends.keys())
    const skippedFriendIds = dedupedFriendIds.filter((id) => !invitedFriends.has(id))

    await prisma.lobbyInvites.createMany({
      data: invitedFriendIds.map((inviteeId) => ({
        lobbyId: lobby.id,
        inviterId: requestUser.id,
        inviteeId,
        channel: 'friends',
      })),
    })

    log.info('Lobby invites sent', {
      lobbyCode: code,
      senderId: requestUser.id,
      invitedCount: invitedFriendIds.length,
      skippedCount: skippedFriendIds.length,
    })

    return NextResponse.json({
      success: true,
      invitedCount: invitedFriendIds.length,
      invitedFriendIds,
      skippedFriendIds,
    })
  } catch (error) {
    log.error('Failed to send lobby invites', error as Error)
    return NextResponse.json(
      { error: 'Failed to send invites' },
      { status: 500 }
    )
  }
}
