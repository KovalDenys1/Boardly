import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import crypto from 'crypto'
import { apiLogger } from '@/lib/logger'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = forgotPasswordSchema.parse(body)

    // Check if user exists. Wrap DB call so local/dev DB misconfiguration
    // doesn't return 500 — instead log and return generic success.
    let user
    try {
      user = await prisma.users.findUnique({ where: { email } })
    } catch (dbError) {
      const log = apiLogger('POST /api/auth/forgot-password')
      log.warn('DB lookup failed during forgot-password; returning generic success to caller', {
        email,
        error: (dbError as Error).message,
      })
      return NextResponse.json({
        message: 'If an account exists with that email, you will receive password reset instructions.',
      })
    }

    // Security: Always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      const log = apiLogger('POST /api/auth/forgot-password')
      log.info('Password reset requested for non-existent email', { email })
      return NextResponse.json({
        message: 'If an account exists with that email, you will receive password reset instructions.',
      })
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Delete any existing reset tokens for this user
    await prisma.passwordResetTokens.deleteMany({
      where: { userId: user.id },
    })

    // Create new reset token
    await prisma.passwordResetTokens.create({
      data: {
        userId: user.id,
        token,
        expires,
      },
    })

    // Send email
    const result = await sendPasswordResetEmail(email, token)

    if (!result.success) {
      const log = apiLogger('POST /api/auth/forgot-password')
      // For local/dev environments the email provider may not be configured.
      // Treat email send failures as non-fatal: log a warning and return
      // the same generic response to the client to avoid email enumeration
      // and to not block users during development.
      log.warn('Password reset email not sent', { error: result.error })

      return NextResponse.json({
        message: 'If an account exists with that email, you will receive password reset instructions.',
      })
    }

    return NextResponse.json({
      message: 'If an account exists with that email, you will receive password reset instructions.',
    })
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
