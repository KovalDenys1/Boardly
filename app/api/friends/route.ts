import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

// Force dynamic rendering (uses request.headers)
export const dynamic = 'force-dynamic'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/friends')

// GET /api/friends - Get user's friends list
export async function GET(req: NextRequest) {
  try {
    const rateLimitResult = await limiter(req)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if email is verified
    if (!session.user.emailVerified) {
      log.warn('Friends list access denied - email not verified', { userId: session.user.id })
      return NextResponse.json(
        { error: 'Email verification required' },
        { status: 403 }
      )
    }

    const userId = session.user.id

    // Get all friendships where user is either user1 or user2
    const friendships = await prisma.friendships.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId }
        ]
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            image: true,
            email: true,
            bot: true,  // Bot relation
          }
        },
        user2: {
          select: {
            id: true,
            username: true,
            image: true,
            email: true,
            bot: true,  // Bot relation
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Map to return the friend (not the current user)
    const friends = friendships.map(friendship => {
      const friend = friendship.user1Id === userId ? friendship.user2 : friendship.user1
      return {
        ...friend,
        friendshipId: friendship.id,
        friendsSince: friendship.createdAt
      }
    })

    log.info('Friends list retrieved', { userId, count: friends.length })

    return NextResponse.json({ friends })

  } catch (error) {
    log.error('Error fetching friends', error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch friends' },
      { status: 500 }
    )
  }
}
