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

const unkickSchema = z.object({
  userId: z.string().min(1),
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

    // Remember the decision, atomically with the removal. A bare delete is a kick the player
    // walks straight back through: re-opening the invite link is enough, because the
    // public-lobby auto-join fires on a fresh mount with no click from them (#1013).
    await prisma.$transaction([
      prisma.players.delete({ where: { id: playerId } }),
      prisma.lobbies.update({
        where: { id: lobby.id },
        data: { kickedUserIds: { push: targetPlayer.userId } },
      }),
    ])

    const remainingCount = waitingGame.players.length - 1

    void broadcastToLobby(code, 'player-kicked', {
      lobbyCode: code,
      userId: targetPlayer.userId,
      // Never fall back to the email address: this goes onto the lobby's
      // realtime topic, which is not private and whose 4-digit code can be
      // enumerated, so an address would be readable by anyone (#801).
      username: targetPlayer.user.username || 'Player',
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

/**
 * Let the host undo a kick (#1024).
 *
 * #1013 gave the kick a memory because a bare delete was a kick the player walked
 * straight back through. That memory was then permanent for the life of the lobby,
 * which makes a mis-click final — and a mis-click is the common case, since the
 * button sits next to the player list.
 *
 * Removing the entry is all this does. It does not re-seat anybody: the player
 * rejoins through the invite link like anyone else, which keeps one path into a
 * lobby rather than two.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const log = apiLogger('DELETE /api/lobby/[code]/kick-player')
  try {
    const requestUser = await getRequestAuthUser(request)
    const hostId = requestUser?.id

    if (!hostId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    const body = unkickSchema.safeParse(await request.json())
    if (!body.success) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
    }
    const { userId } = body.data

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      // kickedUserIds is omitted globally (lib/db.ts). Naming it in `select` is
      // enough to get it back, and Prisma refuses `select` and `omit` together.
      select: { id: true, creatorId: true, isActive: true, kickedUserIds: true },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== hostId) {
      return NextResponse.json({ error: 'Only the host can let a player back in' }, { status: 403 })
    }

    if (!lobby.isActive) {
      return NextResponse.json({ error: 'Lobby is no longer active' }, { status: 409 })
    }

    if (!lobby.kickedUserIds.includes(userId)) {
      // Already welcome — saying so plainly beats a 404 for a state the host wanted.
      return NextResponse.json({ success: true, message: 'Player was not kicked' })
    }

    await prisma.lobbies.update({
      where: { id: lobby.id },
      data: { kickedUserIds: lobby.kickedUserIds.filter((id) => id !== userId) },
    })

    log.info('Host let a kicked player back in', { code, userId })

    void broadcastToLobby(code, 'player-unkicked', {
      lobbyCode: code,
      userId,
    })

    return NextResponse.json({ success: true, message: 'Player may rejoin' })
  } catch (error) {
    log.error('Error letting a kicked player back in', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * The kicked list, for the host's waiting room (#899 / #1024).
 *
 * The DELETE above is the undo, but a host cannot undo what they cannot see, and
 * `kickedUserIds` holds ids – the waiting room needs names and faces. Host-only:
 * who a host removed is moderation bookkeeping, not lobby-wide information.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const log = apiLogger('GET /api/lobby/[code]/kick-player')
  try {
    const requestUser = await getRequestAuthUser(request)
    const hostId = requestUser?.id

    if (!hostId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      // kickedUserIds is omitted globally (lib/db.ts); naming it in `select` is
      // what brings it back, and Prisma refuses `select` and `omit` together.
      select: { creatorId: true, kickedUserIds: true },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== hostId) {
      return NextResponse.json({ error: 'Only the host can see who was removed' }, { status: 403 })
    }

    if (lobby.kickedUserIds.length === 0) {
      return NextResponse.json({ kickedPlayers: [] })
    }

    const users = await prisma.users.findMany({
      where: { id: { in: lobby.kickedUserIds } },
      // Never `select: undefined` here: the default row carries the email address,
      // and this list is rendered (#801 keeps addresses off every lobby surface).
      select: { id: true, username: true, image: true, avatarUrl: true },
    })
    const byId = new Map(users.map((user) => [user.id, user]))

    // Walk the stored ids, not the rows: a guest account is hard-deleted after three
    // days, and its id staying on the list is exactly the entry a host wants to clear.
    const kickedPlayers = lobby.kickedUserIds.map((userId) => {
      const user = byId.get(userId)
      return {
        userId,
        username: user?.username ?? null,
        avatarUrl: user?.avatarUrl ?? user?.image ?? null,
      }
    })

    return NextResponse.json({ kickedPlayers })
  } catch (error) {
    log.error('Error listing kicked players', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
