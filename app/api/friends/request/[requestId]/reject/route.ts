import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/friends/request/reject')

// POST /api/friends/request/[requestId]/reject - Reject friend request
export async function POST(
  req: NextRequest,
  { params }: { params: { requestId: string } }
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

    // Get friend request
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: params.requestId }
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
        { error: 'Not authorized to reject this request' },
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
    await prisma.friendRequest.update({
      where: { id: params.requestId },
      data: { status: 'rejected' }
    })

    log.info('Friend request rejected', {
      requestId: params.requestId,
      receiverId: user.id,
      senderId: friendRequest.senderId
    })

    return NextResponse.json({
      success: true,
      message: 'Friend request rejected'
    })

  } catch (error) {
    log.error('Error rejecting friend request', error as Error, { requestId: params.requestId })
    return NextResponse.json(
      { error: 'Failed to reject friend request' },
      { status: 500 }
    )
  }
}
