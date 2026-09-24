import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import bcrypt from 'bcrypt'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.auth)

// Use strong password validation from auth validation
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/\d/, 'Password must contain at least one number'),
})

export async function POST(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { token, password } = resetPasswordSchema.parse(body)

    // Find valid reset token
    const resetToken = await prisma.passwordResetTokens.findUnique({
      where: { token },
    })

    if (!resetToken) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      )
    }

    // Check if token has expired
    if (resetToken.expires < new Date()) {
      await prisma.passwordResetTokens.delete({
        where: { id: resetToken.id },
      })
      return NextResponse.json(
        { error: 'Reset token has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.users.findUnique({
      where: { id: resetToken.userId },
      select: { pendingEmail: true },
    })

    // Update the password and end every session that signed in before now
    // (#1136). Sessions are stateless JWTs, so without the cutoff a session
    // stolen before the reset kept working for the rest of its 30 days;
    // lib/next-auth.ts rejects any token whose authenticatedAt is earlier.
    //
    // A pending email change is cancelled too. It may be the attacker's: with
    // only a stolen session they could put their own address in pendingEmail,
    // and its verification link, which needs no session, would still promote it
    // after the owner had taken the account back. The owner can ask again.
    await prisma.users.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        sessionsValidFrom: new Date(),
        ...(user?.pendingEmail ? { pendingEmail: null } : {}),
      },
    })

    if (user?.pendingEmail) {
      await prisma.emailVerificationTokens.deleteMany({
        where: { userId: resetToken.userId },
      })
    }

    // Delete used token
    await prisma.passwordResetTokens.delete({
      where: { id: resetToken.id },
    })

    return NextResponse.json({
      message: 'Password reset successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }

    const log = apiLogger('POST /api/auth/reset-password')
    log.error('Reset password error', error as Error)
    return NextResponse.json(
      { error: 'An error occurred. Please try again later.' },
      { status: 500 }
    )
  }
}
