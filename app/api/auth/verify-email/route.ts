import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email'
import { apiLogger } from '@/lib/logger'
import { ensureUserHasFriendCode } from '@/lib/friend-code'
import { normalizeProfileEmail } from '@/lib/profile-email'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

// Tokens are nanoid(32) (see register:124), so a wrong-shaped token is noise, not a
// brute-force risk — 32+ random characters is infeasible to guess. The schema and limiter
// are hygiene: an object or array token used to reach `findUnique` and come back as a
// Prisma validation error (a 500) instead of a 400, and the route had no rate limit at all
// (#1119, audit S2-04/S2-07).
const verifyEmailSchema = z.object({
  token: z.string().min(16).max(64),
})

const limiter = rateLimit(rateLimitPresets.api)

export async function POST(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json().catch(() => null)
    const parsed = verifyEmailSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const { token } = parsed.data

    const verificationToken = await prisma.emailVerificationTokens.findUnique({
      where: { token },
    })

    if (!verificationToken) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    }

    if (verificationToken.expires < new Date()) {
      await prisma.emailVerificationTokens.delete({
        where: { token },
      })
      return NextResponse.json({ error: 'Token has expired' }, { status: 400 })
    }

    // Get user details for welcome email and check if already verified
    const user = await prisma.users.findUnique({
      where: { id: verificationToken.userId },
      select: {
        id: true,
        email: true,
        pendingEmail: true,
        username: true,
        emailVerified: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const pendingEmail = user.pendingEmail ? normalizeProfileEmail(user.pendingEmail) : null
    const hasPendingEmailChange = Boolean(pendingEmail)

    // If already verified and there is no pending email change, return success (idempotent)
    if (user.emailVerified && !hasPendingEmailChange) {
      // Clean up token and return success
      await prisma.emailVerificationTokens.delete({
        where: { token },
      }).catch(() => {}) // Token might already be deleted
      return NextResponse.json({ message: 'Email verified successfully' })
    }

    // Use transaction to ensure atomicity and prevent race conditions
    await prisma.$transaction(async (tx) => {
      // A completed email change ends every session signed in before it
      // (#1136), the one confirming it included: the sign-in address has just
      // changed, so each device signs in again with the new one.
      const updateData = hasPendingEmailChange
        ? {
            email: pendingEmail,
            pendingEmail: null,
            emailVerified: new Date(),
            sessionsValidFrom: new Date(),
          }
        : {
            emailVerified: new Date(),
          }

      await tx.users.update({
        where: { id: verificationToken.userId },
        data: updateData,
      })

      // Delete the verification token
      await tx.emailVerificationTokens.delete({
        where: { token },
      })
    })

    // Generate friend code for newly verified user (non-blocking)
    ensureUserHasFriendCode(user.id)
      .catch((error) => {
        const log = apiLogger('POST /api/auth/verify-email')
        log.warn('Failed to generate friend code (non-critical)', { error })
      })

    // Send welcome email after first successful verification (non-blocking)
    if (!hasPendingEmailChange && !user.emailVerified && user.email) {
      sendWelcomeEmail(user.email, user.username || 'Player')
        .catch((error) => {
          const log = apiLogger('POST /api/auth/verify-email')
          log.warn('Failed to send welcome email (non-critical)', { error })
        })
    }

    return NextResponse.json({
      message: hasPendingEmailChange
        ? 'New email verified successfully'
        : 'Email verified successfully',
      signedOut: hasPendingEmailChange,
    })
  } catch (error) {
    const log = apiLogger('POST /api/auth/verify-email')
    log.error('Email verification error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
