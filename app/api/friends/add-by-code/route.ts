import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/prisma/client'
import { findUserByFriendCode } from '@/lib/friend-code'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets, consumeKeyedRateLimit } from '@/lib/rate-limit'
import { createInAppNotification } from '@/lib/in-app-notifications'
import { sendPushNotification } from '@/lib/push-send'
import { requireSessionUser } from '@/lib/session-user'
import { presentProfileParty } from '@/lib/public-profile'

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

    const auth = await requireSessionUser(req)
    if ('response' in auth) {
      return auth.response
    }
    const { session } = auth

    // Check if email is verified
    if (!session.user.emailVerified) {
      log.warn('Friend request denied - email not verified', { userId: session.user.id })
      return NextResponse.json(
        { error: 'Email verification required' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { friendCode } = body

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

    // #1120 (audit S2-05): a 5-digit code is only 100,000 values, and the shared 60/min IP
    // limiter above does nothing once guesses spread across addresses. This caps guesses
    // per account, whatever IP they come from — every guess counts, not only wrong ones,
    // since a normal user sending several correct codes an hour is already an edge case.
    const attemptLimit = await consumeKeyedRateLimit(
      `friend-code-attempt:${session.user.id}`,
      rateLimitPresets.friendCodeAttempt
    )
    if (attemptLimit.limited) {
      log.warn('Friend code attempt limit exceeded', { userId: session.user.id })
      return NextResponse.json(
        { error: 'Too many friend code attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': attemptLimit.retryAfterSeconds.toString() },
        }
      )
    }

    // Get current user
    const currentUser = await prisma.users.findUnique({
      where: { id: session.user.id },
      select: { id: true, username: true, bot: true }
    })

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (currentUser.bot) {
      return NextResponse.json(
        { error: 'Bots cannot send friend requests' },
        { status: 400 }
      )
    }

    // Find user by friend code
    const targetUser = await findUserByFriendCode(cleanCode)
    
    if (!targetUser) {
      // 400, not 404 (#1120, audit S2-05): an unassigned code used to answer 404 while a
      // self/already-friends/pending code answers 400, which lets an attacker tell "this
      // code belongs to someone" from "this code belongs to nobody" purely from the status.
      return NextResponse.json(
        { error: 'User not found with this friend code' },
        { status: 400 }
      )
    }

    // Check if trying to add yourself
    if (targetUser.id === currentUser.id) {
      return NextResponse.json(
        { error: 'You cannot add yourself as a friend' },
        { status: 400 }
      )
    }

    // Check if already friends
    const existingFriendship = await prisma.friendships.findFirst({
      where: {
        OR: [
          { user1Id: currentUser.id, user2Id: targetUser.id },
          { user1Id: targetUser.id, user2Id: currentUser.id }
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
    const pendingRequest = await prisma.friendRequests.findFirst({
      where: {
        OR: [
          { senderId: currentUser.id, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: currentUser.id }
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

    // A separate, longer-window cap on requests that actually go out (#1120, audit S2-05):
    // the 10/hour attempt limiter above bounds guessing, but a slow drip of correct guesses
    // spread across many hours would not trip it, and could still spam every user found.
    const dailyOutgoingLimit = await consumeKeyedRateLimit(
      `friend-code-outgoing:${currentUser.id}`,
      rateLimitPresets.friendCodeDailyOutgoing
    )
    if (dailyOutgoingLimit.limited) {
      log.warn('Friend code daily outgoing limit exceeded', { userId: currentUser.id })
      return NextResponse.json(
        { error: 'Too many friend requests sent today. Please try again tomorrow.' },
        {
          status: 429,
          headers: { 'Retry-After': dailyOutgoingLimit.retryAfterSeconds.toString() },
        }
      )
    }

    // Create friend request
    const friendRequest = await prisma.friendRequests.create({
      data: {
        senderId: currentUser.id,
        receiverId: targetUser.id,
        status: 'pending'
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            image: true,
            avatarUrl: true,
            accountPreferences: { select: { profileVisibility: true } },
          }
        }
      }
    })

    // The sender is not the receiver's friend (checked above), so the internal id goes
    // back only when the receiver's profile is public (#1226), by the same rule as POST
    // /api/friends/request; the username and picture are public and always go back. A
    // friend code proves you know someone's code, not that you may see their profile.
    const { receiver, receiverId, ...friendRequestFields } = friendRequest
    const presentedReceiver = presentProfileParty(receiver, 'other')
    const friendRequestWithAvatar = {
      ...friendRequestFields,
      ...(presentedReceiver.visible ? { receiverId } : {}),
      receiver: presentedReceiver.party,
    }

    await createInAppNotification({
      userId: targetUser.id,
      type: 'friend_request',
      dedupeKey: `friend_request:${friendRequest.id}`,
      payload: {
        requestId: friendRequest.id,
        senderId: currentUser.id,
        senderName: currentUser.username || 'Player',
        source: 'friend_code',
        href: '/profile?tab=friends',
      },
    })

    void sendPushNotification(targetUser.id, {
      title: `${currentUser.username || 'Someone'} sent you a friend request`,
      body: 'Tap to respond',
      url: '/profile?tab=friends',
      tag: `friend_request:${friendRequest.id}`,
    })

    log.info('Friend request sent via friend code', {
      senderId: currentUser.id,
      receiverId: targetUser.id,
      friendCode: cleanCode
    })

    return NextResponse.json({
      success: true,
      request: friendRequestWithAvatar,
      user: presentProfileParty(targetUser, 'other').party,
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A friend request is already pending with this user' },
        { status: 400 }
      )
    }

    log.error('Error adding friend by code', error)

    return NextResponse.json(
      { error: 'Failed to send friend request' },
      { status: 500 }
    )
  }
}
