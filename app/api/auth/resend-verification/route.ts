import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { nanoid } from 'nanoid'
import { apiLogger } from '@/lib/logger'
import { normalizeProfileEmail } from '@/lib/profile-email'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/auth/resend-verification')
const GENERIC_RESEND_RESPONSE = {
  success: true,
  message: 'If an unverified account exists for this email, a verification message was sent.',
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    // Try to get session first (for logged-in users)
    const session = await getServerSession(authOptions)
    
    let user: {
      id: string
      email: string | null
      pendingEmail: string | null
      emailVerified: Date | null
      username: string | null
    } | null = null

    if (session?.user?.id) {
      user = await prisma.users.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          pendingEmail: true,
          emailVerified: true,
          username: true,
        },
      })
    } else {
      const body = await request.json()
      const email = body.email

      if (typeof email !== 'string' || email.trim().length === 0) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 })
      }

      const normalizedEmail = normalizeProfileEmail(email)

      user = await prisma.users.findFirst({
        where: {
          OR: [
            {
              email: {
                equals: normalizedEmail,
                mode: 'insensitive',
              },
            },
            {
              pendingEmail: {
                equals: normalizedEmail,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          id: true,
          email: true,
          pendingEmail: true,
          emailVerified: true,
          username: true,
        },
      })
    }

    const hasPendingEmailChange = Boolean(user?.pendingEmail)
    const needsVerification = hasPendingEmailChange || Boolean(user && !user.emailVerified)

    if (user && needsVerification) {
      const verificationTarget = user.pendingEmail || user.email

      if (!verificationTarget) {
        return NextResponse.json(GENERIC_RESEND_RESPONSE)
      }

      try {
        await prisma.emailVerificationTokens.deleteMany({
          where: { userId: user.id },
        })

        const token = nanoid(32)
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        await prisma.emailVerificationTokens.create({
          data: {
            userId: user.id,
            token,
            expires,
          },
        })

        await sendVerificationEmail(verificationTarget, token, user.username || 'User')

        log.info('Verification email resent', {
          userId: user.id,
          pendingEmailChange: hasPendingEmailChange,
        })
      } catch (dispatchError) {
        log.warn('Verification resend processing failed', {
          userId: user.id,
          error: dispatchError instanceof Error ? dispatchError.message : 'Unknown error',
        })
      }
    } else {
      log.info('Verification resend accepted without token issue', {
        hasUser: !!user,
        alreadyVerified: !!user?.emailVerified && !hasPendingEmailChange,
      })
    }

    return NextResponse.json(GENERIC_RESEND_RESPONSE)
  } catch (error) {
    log.error('Resend verification error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
