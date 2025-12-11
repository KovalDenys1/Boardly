import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { sendAccountDeletionEmail } from '@/lib/email'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { randomBytes } from 'crypto'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/user/request-deletion')

// Token model for account deletion
interface AccountDeletionToken {
  id: string
  userId: string
  token: string
  expires: Date
  createdAt: Date
}

export async function POST(req: NextRequest) {
  try {
    await limiter(req)

    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        username: true,
        isBot: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.isBot) {
      return NextResponse.json(
        { error: 'Bot accounts cannot be deleted this way' },
        { status: 400 }
      )
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'Email is required for account deletion' },
        { status: 400 }
      )
    }

    // Generate secure token
    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Store token in PasswordResetToken table (reusing for deletion tokens)
    // We'll use a special format to distinguish deletion tokens: "DELETE_" prefix
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: `DELETE_${token}`,
        expires
      }
    })

    // Send deletion confirmation email
    await sendAccountDeletionEmail(
      user.email,
      token, // Don't include DELETE_ prefix in email
      user.username || 'User'
    )

    log.info('Account deletion requested', {
      userId: user.id,
      email: user.email
    })

    return NextResponse.json({
      success: true,
      message: 'Deletion confirmation email sent'
    })

  } catch (error) {
    log.error('Error requesting account deletion', error as Error)
    return NextResponse.json(
      { error: 'Failed to request account deletion' },
      { status: 500 }
    )
  }
}
