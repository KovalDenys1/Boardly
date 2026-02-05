import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/friends/request/accept')

// POST /api/friends/request/[requestId]/accept - Accept friend request
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    await limiter(req)
    const { requestId } = await params

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if email is verified
    if (!session.user.emailVerified) {
      log.warn('Accept friend request denied - email not verified', { userId: session.user.id })
      return NextResponse.json(
        { error: 'Email verification required' },
        { status: 403 }
      )
    }

    const user = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get friend request
    const friendRequest = await prisma.friendRequests.findUnique({
      where: { id: requestId }
    })

    if (!friendRequest) {
      return NextResponse.json(
        { error: 'Friend request not found' },
        { status: 404 }
      )
    }

    // Verify user is the receiver
    if (friendRequest.receiverId !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to accept this request' },
        { status: 403 }
      )
    }

    if (friendRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request already processed' },
        { status: 400 }
      )
    }

    // Update request status
    await prisma.friendRequests.update({
      where: { id: requestId },
      data: { status: 'accepted' }
    })

    // Create friendship (ensure user1Id < user2Id for consistency)
    const [user1Id, user2Id] = [friendRequest.senderId, friendRequest.receiverId].sort()
    
    const friendship = await prisma.friendships.create({
      data: {
        user1Id,
        user2Id
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
          }
        },
        user2: {
          select: {
            id: true,
            username: true,
          }
        }
      }
    })

    log.info('Friend request accepted', {
      requestId: requestId,
      user1Id,
      user2Id,
      friendshipId: friendship.id
    })

    return NextResponse.json({
      success: true,
      friendship
    })

  } catch (error) {
    log.error('Error accepting friend request', error as Error, { requestId: (await params).requestId })
    return NextResponse.json(
      { error: 'Failed to accept friend request' },
      { status: 500 }
    )
  }
}
