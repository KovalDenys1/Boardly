import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/next-auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      image: true,
      avatarUrl: true,
      publicProfileId: true,
      isGuest: true,
      bot: { select: { id: true } },
      players: {
        where: { game: { status: 'finished' } },
        select: {
          isWinner: true,
          game: { select: { gameType: true } },
        },
      },
    },
  })

  if (!user || user.bot) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const gamesPlayed = user.players.length
  const wins = user.players.filter((p) => p.isWinner).length
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0

  const gameTypeCounts: Record<string, number> = {}
  for (const p of user.players) {
    const gt = p.game.gameType as string
    gameTypeCounts[gt] = (gameTypeCounts[gt] ?? 0) + 1
  }
  const favouriteGame =
    Object.entries(gameTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const session = await getServerSession(authOptions)
  type Relation = 'self' | 'friends' | 'request_sent' | 'request_received' | 'can_send' | 'login_required'
  let relation: Relation = 'login_required'

  if (!user.isGuest && session?.user?.id) {
    if (session.user.id === userId) {
      relation = 'self'
    } else {
      const [friendship, request] = await Promise.all([
        prisma.friendships.findFirst({
          where: {
            OR: [
              { user1Id: session.user.id, user2Id: userId },
              { user1Id: userId, user2Id: session.user.id },
            ],
          },
          select: { id: true },
        }),
        prisma.friendRequests.findFirst({
          where: {
            OR: [
              { senderId: session.user.id, receiverId: userId, status: 'pending' },
              { senderId: userId, receiverId: session.user.id, status: 'pending' },
            ],
          },
          select: { id: true, senderId: true },
        }),
      ])

      if (friendship) {
        relation = 'friends'
      } else if (request) {
        relation = request.senderId === session.user.id ? 'request_sent' : 'request_received'
      } else {
        relation = 'can_send'
      }
    }
  }

  return NextResponse.json({
    userId: user.id,
    username: user.username,
    image: user.avatarUrl ?? user.image,
    publicProfileId: user.publicProfileId,
    isGuest: user.isGuest,
    gamesPlayed,
    wins,
    winRate,
    favouriteGame,
    relation,
  })
}
