import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { sendSocialInviteEmail } from '@/lib/email'
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
      Array.from(invitedFriends.values()).map((friend) => {
        if (!friend.email) {
          return Promise.resolve({ success: false, error: 'Missing recipient email' })
        }

        return sendSocialInviteEmail({
          email: friend.email,
          recipientName: friend.username,
          senderName: requestUser.username,
          lobbyName: lobby.name,
          gameType: lobby.gameType,
          inviteUrl,
          type: 'invite',
        })
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
