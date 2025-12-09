import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { findUserByFriendCode } from '@/lib/friend-code'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/**
 * POST /api/friends/add-by-code
 * Send friend request by friend code
 */
export async function POST(req: NextRequest) {
  const log = apiLogger('/api/friends/add-by-code')
  
  // Rate limiting
  const rateLimitResult = await rateLimit(rateLimitPresets.api)(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { friendCode, message } = body

    if (!friendCode || typeof friendCode !== 'string') {
      return NextResponse.json(
        { error: 'Friend code is required' },
        { status: 400 }
      )
    }

    // Remove spaces and validate format
    const cleanCode = friendCode.replace(/\s/g, '')
    if (!/^\d{5}$/.test(cleanCode)) {
      return NextResponse.json(
        { error: 'Invalid friend code format. Must be 5 digits.' },
        { status: 400 }
      )
    }

    // Find user by friend code
    const targetUser = await findUserByFriendCode(cleanCode)
    
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found with this friend code' },
        { status: 404 }
      )
    }

    // Check if trying to add yourself
    if (targetUser.id === session.user.id) {
      return NextResponse.json(
        { error: 'You cannot add yourself as a friend' },
        { status: 400 }
      )
    }

    // Check if already friends
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: session.user.id, user2Id: targetUser.id },
          { user1Id: targetUser.id, user2Id: session.user.id }
        ]
      }
    })

    if (existingFriendship) {
      return NextResponse.json(
        { error: 'You are already friends with this user' },
        { status: 400 }
      )
    }

    // Check for pending request
    const pendingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: session.user.id, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: session.user.id }
        ],
        status: 'pending'
      }
    })

    if (pendingRequest) {
      return NextResponse.json(
        { error: 'A friend request is already pending with this user' },
        { status: 400 }
      )
    }

    // Create friend request
    const friendRequest = await prisma.friendRequest.create({
      data: {
        senderId: session.user.id,
        receiverId: targetUser.id,
        message: message || null,
        status: 'pending'
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            avatar: true
          }
        }
      }
    })

    log.info('Friend request sent via friend code', {
      senderId: session.user.id,
      receiverId: targetUser.id,
      friendCode: cleanCode
    })

    return NextResponse.json({
      success: true,
      request: friendRequest,
      user: targetUser
    })
  } catch (error: any) {
    log.error('Error adding friend by code', error)

    return NextResponse.json(
      { error: 'Failed to send friend request' },
      { status: 500 }
    )
  }
}
