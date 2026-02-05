import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/api/user/delete-account')

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Find deletion token (with DELETE_ prefix)
    const deletionToken = await prisma.passwordResetTokens.findUnique({
      where: { token: `DELETE_${token}` }
    })

    if (!deletionToken) {
      return NextResponse.json(
        { error: 'Invalid or expired deletion token' },
        { status: 400 }
      )
    }

    if (deletionToken.expires < new Date()) {
      await prisma.passwordResetTokens.delete({
        where: { token: `DELETE_${token}` }
      })
      return NextResponse.json(
        { error: 'Deletion token has expired' },
        { status: 400 }
      )
    }

    // Get user details before deletion
    const user = await prisma.users.findUnique({
      where: { id: deletionToken.userId },
      select: {
        id: true,
        email: true,
        username: true,
        bot: true  // Bot relation
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.bot) {
      return NextResponse.json(
        { error: 'Bot accounts cannot be deleted' },
        { status: 400 }
      )
    }

    log.info('Starting account deletion', {
      userId: user.id,
      email: user.email,
      username: user.username
    })

    // Delete all related data (cascade delete will handle most of this)
    // But we'll be explicit for logging purposes
    
    // Delete tokens
      await prisma.passwordResetTokens.deleteMany({
      where: { userId: user.id }
    })
    await prisma.emailVerificationTokens.deleteMany({
      where: { userId: user.id }
    })

    // Delete friend requests (sent and received)
    await prisma.friendRequests.deleteMany({
      where: {
        OR: [
          { senderId: user.id },
          { receiverId: user.id }
        ]
      }
    })

    // Delete friendships
    await prisma.friendships.deleteMany({
      where: {
        OR: [
          { user1Id: user.id },
          { user2Id: user.id }
        ]
      }
    })

    // Delete the user (this will cascade delete sessions, accounts, players, lobbies)
    await prisma.users.delete({
      where: { id: user.id }
    })

    log.info('Account deleted successfully', {
      userId: user.id,
      email: user.email
    })

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully'
    })

  } catch (error) {
    log.error('Error deleting account', error as Error)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
