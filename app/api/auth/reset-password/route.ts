import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { apiLogger } from '@/lib/logger'

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, password } = resetPasswordSchema.parse(body)

    // Find valid reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
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
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      })
      return NextResponse.json(
        { error: 'Reset token has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10)

    // Update user password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    })

    // Delete used token
    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    })

    return NextResponse.json({
      message: 'Password reset successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues },
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
