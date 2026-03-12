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
type FriendPresence = 'offline' | 'online' | 'in_lobby' | 'in_game'

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
            accountPreferences: {
              select: {
                showOnlineStatus: true,
              },
            },
          }
        },
        user2: {
          select: {
            id: true,
            username: true,
            image: true,
            email: true,
            bot: true,  // Bot relation
            accountPreferences: {
              select: {
                showOnlineStatus: true,
              },
            },
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Map to return the friend (not the current user)
    const friends = friendships.map(friendship => {
      const friend = friendship.user1Id === userId ? friendship.user2 : friendship.user1
      const { accountPreferences, ...friendFields } = friend
      return {
        ...friendFields,
        showOnlineStatus: accountPreferences?.showOnlineStatus ?? true,
        friendshipId: friendship.id,
        friendsSince: friendship.createdAt,
      }
    })

    const friendIds = friends.map((friend) => friend.id)
    const friendIdSet = new Set(friendIds)
    const presenceByUserId = new Map<string, FriendPresence>()

    if (friendIds.length > 0) {
      const activeGames = await prisma.games.findMany({
        where: {
          status: {
            in: ['waiting', 'playing'],
          },
          players: {
            some: {
              userId: {
                in: friendIds,
              },
            },
          },
        },
        select: {
          status: true,
          players: {
            select: {
              userId: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })

      for (const game of activeGames) {
        const nextPresence: FriendPresence = game.status === 'playing' ? 'in_game' : 'in_lobby'

        for (const player of game.players) {
          if (!friendIdSet.has(player.userId)) {
            continue
          }

          const currentPresence = presenceByUserId.get(player.userId)
          if (currentPresence === 'in_game') {
            continue
          }

          presenceByUserId.set(player.userId, nextPresence)
        }
      }
    }

    const friendsWithPresence = friends.map(({ showOnlineStatus, ...friend }) => ({
      ...friend,
      presence: showOnlineStatus ? presenceByUserId.get(friend.id) || 'offline' : 'offline',
    }))

    log.info('Friends list retrieved', { userId, count: friendsWithPresence.length })

    return NextResponse.json({ friends: friendsWithPresence })

  } catch (error) {
    log.error('Error fetching friends', error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch friends' },
      { status: 500 }
    )
  }
}
