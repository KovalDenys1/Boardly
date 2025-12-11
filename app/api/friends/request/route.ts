import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/friends/request')

// POST /api/friends/request - Send friend request
export async function POST(req: NextRequest) {
  try {
    await limiter(req)

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { receiverUsername } = await req.json()

    if (!receiverUsername) {
      return NextResponse.json(
        { error: 'Receiver username is required' },
        { status: 400 }
      )
    }

    // Get sender
    const sender = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, username: true, isBot: true }
    })

    if (!sender) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (sender.isBot) {
      return NextResponse.json(
        { error: 'Bots cannot send friend requests' },
        { status: 400 }
      )
    }

    // Get receiver
    const receiver = await prisma.user.findUnique({
      where: { username: receiverUsername },
      select: { id: true, username: true, isBot: true }
    })

    if (!receiver) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (receiver.isBot) {
      return NextResponse.json(
        { error: 'Cannot send friend request to bot' },
        { status: 400 }
      )
    }

    if (sender.id === receiver.id) {
      return NextResponse.json(
        { error: 'Cannot send friend request to yourself' },
        { status: 400 }
      )
    }

    // Check if already friends
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: sender.id, user2Id: receiver.id },
          { user1Id: receiver.id, user2Id: sender.id }
        ]
      }
    })

    if (existingFriendship) {
      return NextResponse.json(
        { error: 'Already friends' },
        { status: 400 }
      )
    }

    // Check for existing pending request
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: sender.id, receiverId: receiver.id, status: 'pending' },
          { senderId: receiver.id, receiverId: sender.id, status: 'pending' }
        ]
      }
    })

    if (existingRequest) {
      return NextResponse.json(
        { error: 'Friend request already exists' },
        { status: 400 }
      )
    }

    // Create friend request
    const friendRequest = await prisma.friendRequest.create({
      data: {
        senderId: sender.id,
        receiverId: receiver.id,
        status: 'pending'
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            
            email: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            
            email: true
          }
        }
      }
    })

    log.info('Friend request sent', {
      senderId: sender.id,
      receiverId: receiver.id,
      requestId: friendRequest.id
    })

    return NextResponse.json({ 
      success: true, 
      friendRequest 
    })

  } catch (error) {
    log.error('Error sending friend request', error as Error)
    return NextResponse.json(
      { error: 'Failed to send friend request' },
      { status: 500 }
    )
  }
}

// GET /api/friends/request - Get pending friend requests
export async function GET(req: NextRequest) {
  try {
    await limiter(req)

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'received' // received, sent, all

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let whereClause: any = {
      status: 'pending'
    }

    if (type === 'received') {
      whereClause.receiverId = user.id
    } else if (type === 'sent') {
      whereClause.senderId = user.id
    } else if (type === 'all') {
      whereClause.OR = [
        { senderId: user.id },
        { receiverId: user.id }
      ]
    }

    const requests = await prisma.friendRequest.findMany({
      where: whereClause,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            
            email: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    log.info('Friend requests fetched', {
      userId: user.id,
      type,
      count: requests.length
    })

    return NextResponse.json({ requests })

  } catch (error) {
    log.error('Error fetching friend requests', error as Error)
    return NextResponse.json(
      { error: 'Failed to fetch friend requests' },
      { status: 500 }
    )
  }
}
