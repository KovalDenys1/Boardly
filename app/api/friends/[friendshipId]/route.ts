import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/friends/[friendshipId]')

// DELETE /api/friends/[friendshipId] - Remove friend
export async function DELETE(
  req: NextRequest,
  { params }: { params: { friendshipId: string } }
) {
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

    // Get friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id: params.friendshipId }
    })

    if (!friendship) {
      return NextResponse.json(
        { error: 'Friendship not found' },
        { status: 404 }
      )
    }

    // Verify user is part of this friendship
    if (friendship.user1Id !== user.id && friendship.user2Id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to delete this friendship' },
        { status: 403 }
      )
    }

    // Delete friendship
    await prisma.friendship.delete({
      where: { id: params.friendshipId }
    })

    log.info('Friendship removed', {
      friendshipId: params.friendshipId,
      userId: user.id,
      user1Id: friendship.user1Id,
      user2Id: friendship.user2Id
    })

    return NextResponse.json({
      success: true,
      message: 'Friend removed'
    })

  } catch (error) {
    log.error('Error removing friend', error as Error, { friendshipId: params.friendshipId })
    return NextResponse.json(
      { error: 'Failed to remove friend' },
      { status: 500 }
    )
  }
}
