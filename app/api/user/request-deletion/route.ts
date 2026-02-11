import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { sendAccountDeletionEmail } from '@/lib/email'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { randomBytes } from 'crypto'
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
  withErrorHandler,
} from '@/lib/error-handler'

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

async function requestDeletionHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    throw new AuthenticationError('Unauthorized')
  }

  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      username: true,
      bot: true, // Bot relation
    },
  })

  if (!user) {
    throw new NotFoundError('User')
  }

  if (user.bot) {
    throw new ValidationError('Bot accounts cannot be deleted this way')
  }

  if (!user.email) {
    throw new ValidationError('Email is required for account deletion')
  }

  // Generate secure token
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Store token in PasswordResetToken table (reusing for deletion tokens)
  // We'll use a special format to distinguish deletion tokens: "DELETE_" prefix
  await prisma.passwordResetTokens.create({
    data: {
      userId: user.id,
      token: `DELETE_${token}`,
      expires,
    },
  })

  // Send deletion confirmation email
  await sendAccountDeletionEmail(
    user.email,
    token, // Don't include DELETE_ prefix in email
    user.username || 'User'
  )

  log.info('Account deletion requested', {
    userId: user.id,
    email: user.email,
  })

  return NextResponse.json({
    success: true,
    message: 'Deletion confirmation email sent',
  })
}

export const POST = withErrorHandler(requestDeletionHandler)
