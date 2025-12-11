import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/friends')

// GET /api/friends - Get user's friends list
export async function GET(req: NextRequest) {
  try {
    await limiter(req)

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get all friendships where user is either user1 or user2
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: user.id },
          { user2Id: user.id }
        ]
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            image: true,
            email: true,
            isBot: true,
          }
        },
        user2: {
          select: {
            id: true,
            username: true,
            image: true,
            email: true,
            isBot: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Map to return the friend (not the current user)
    const friends = friendships.map(friendship => {
      const friend = friendship.user1Id === user.id ? friendship.user2 : friendship.user1
      return {
        ...friend,
        friendshipId: friendship.id,
        friendsSince: friendship.createdAt
      }
    })

    log.info('Friends list retrieved', { userId: user.id, count: friends.length })

    return NextResponse.json({ friends })

  } catch (error) {
    log.error('Error fetching friends', error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch friends' },
      { status: 500 }
    )
  }
}
