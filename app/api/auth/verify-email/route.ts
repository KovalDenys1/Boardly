import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email'
import { apiLogger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
    })

    if (!verificationToken) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    }

    if (verificationToken.expires < new Date()) {
      await prisma.emailVerificationToken.delete({
        where: { token },
      })
      return NextResponse.json({ error: 'Token has expired' }, { status: 400 })
    }

    // Get user details for welcome email and check if already verified
    const user = await prisma.user.findUnique({
      where: { id: verificationToken.userId },
      select: { id: true, email: true, username: true, emailVerified: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // If already verified, return success (idempotent)
    if (user.emailVerified) {
      // Clean up token and return success
      await prisma.emailVerificationToken.delete({
        where: { token },
      }).catch(() => {}) // Token might already be deleted
      return NextResponse.json({ message: 'Email verified successfully' })
    }

    // Use transaction to ensure atomicity and prevent race conditions
    await prisma.$transaction(async (tx) => {
      // Update user email verification status
      await tx.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: new Date() },
      })

      // Delete the verification token
      await tx.emailVerificationToken.delete({
        where: { token },
      })
    })

    // Send welcome email after successful verification (non-blocking)
    if (user.email) {
      sendWelcomeEmail(user.email, user.username || 'Player')
        .catch((error) => {
          const log = apiLogger('POST /api/auth/verify-email')
          log.warn('Failed to send welcome email (non-critical)', { error })
        })
    }

    return NextResponse.json({ message: 'Email verified successfully' })
  } catch (error) {
    const log = apiLogger('POST /api/auth/verify-email')
    log.error('Email verification error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
