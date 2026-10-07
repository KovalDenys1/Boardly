import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { emailLanguageFor } from '@/lib/email-language'
import type { EmailLanguage } from '@/lib/email-layout'
import { apiLogger } from '@/lib/logger'
import { failClosedAuthPreset, rateLimit } from '@/lib/rate-limit'
import { insensitiveEquals } from '@/lib/username-match'
import { reserveTransactionalMailSend } from '@/lib/email-send-guard'
import { issueRandomHexToken, passwordResetTokensOf } from '@/lib/auth-tokens'
import { runAfterResponse } from '@/lib/after-response'

const limiter = rateLimit(failClosedAuthPreset)

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address').transform((value) => value.toLowerCase()),
})

const GENERIC_RESPONSE = {
  message: 'If an account exists with that email, you will receive password reset instructions.',
}

/**
 * Throttle check, token rotation and the send, for an address that has an account.
 * Runs after the response (#1142): awaited inside the request, it made an existing
 * address answer measurably later than an unknown one, and a database error here
 * answered 500 where an unknown address never could. Never throws.
 */
async function issuePasswordReset(
  user: { id: string; email: string | null },
  requestedEmail: string,
  language: EmailLanguage | undefined
) {
  const log = apiLogger('POST /api/auth/forgot-password')
  const address = user.email ?? requestedEmail
  try {
    // Per-address cooldown, daily cap and global budget (#1158), checked before the old
    // token is deleted, so a flood of requests cannot invalidate the link already sent.
    const mailDecision = await reserveTransactionalMailSend('password_reset', address)
    if (!mailDecision.allowed) {
      log.info('Password reset mail throttled', { userId: user.id, reason: mailDecision.reason })
      return
    }

    // Generate reset token. Only its hash is stored (#1141, lib/auth-tokens.ts).
    const { token, tokenHash } = issueRandomHexToken()
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Replace this user's earlier reset links; a pending account deletion link is
    // a different purpose and stays valid (#1141).
    await prisma.passwordResetTokens.deleteMany({
      where: passwordResetTokensOf(user.id, 'reset'),
    })

    await prisma.passwordResetTokens.create({
      data: {
        userId: user.id,
        tokenHash,
        purpose: 'reset',
        expires,
      },
    })

    const result = await sendPasswordResetEmail(address, token, language)
    if (!result.success) {
      // For local/dev environments the email provider may not be configured.
      log.warn('Password reset email not sent', { userId: user.id, error: result.error })
    }
  } catch (error) {
    log.error('Password reset issue failed', error, { userId: user.id })
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { email } = forgotPasswordSchema.parse(body)

    // Check if user exists. Wrap DB call so local/dev DB misconfiguration
    // doesn't return 500 — instead log and return generic success.
    let user
    try {
      // `insensitiveEquals`: a bare `equals` + `mode` compiles to an unescaped
      // ILIKE, so an address with `_` or `%` in it was a pattern and the reset
      // could be raised against a different account than the one that asked
      // (#1055).
      user = await prisma.users.findFirst({
        where: {
          email: insensitiveEquals(email),
        },
        select: { id: true, email: true, language: true },
      })
    } catch (dbError) {
      const log = apiLogger('POST /api/auth/forgot-password')
      log.warn('DB lookup failed during forgot-password; returning generic success to caller', {
        error: (dbError as Error).message,
      })
      return NextResponse.json(GENERIC_RESPONSE)
    }

    // Security: Always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      const log = apiLogger('POST /api/auth/forgot-password')
      // The address is not logged (#1132): it names no account, so it is only a
      // stranger's personal data or a typo.
      log.info('Password reset requested for non-existent email')
      return NextResponse.json(GENERIC_RESPONSE)
    }

    // Both branches now answer right after the one lookup; the work that only an
    // existing account triggers happens after the response (#1142).
    runAfterResponse(issuePasswordReset(user, email, emailLanguageFor(user.language, request)))

    return NextResponse.json(GENERIC_RESPONSE)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Invalid email address' },
        { status: 400 }
      )
    }

    const log = apiLogger('POST /api/auth/forgot-password')
    log.error('Forgot password error', error as Error)
    return NextResponse.json(
      { error: 'An error occurred. Please try again later.' },
      { status: 500 }
    )
  }
}
