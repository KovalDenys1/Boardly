import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, NotFoundError, ValidationError } from '@/lib/error-handler'
import { requireAdminApiUser, writeAdminAuditLog } from '@/lib/admin-auth'
import { sendPasswordResetEmail } from '@/lib/email'

async function postAdminResetPasswordHandler(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminApiUser()
  const { id } = params

  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      isGuest: true,
      suspended: true,
    },
  })
  if (!user) {
    throw new NotFoundError('User')
  }

  if (user.isGuest) {
    throw new ValidationError('Guest accounts do not support password reset')
  }

  if (!user.email) {
    throw new ValidationError('User does not have an email address')
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000)

  await prisma.passwordResetTokens.deleteMany({ where: { userId: user.id } })
  await prisma.passwordResetTokens.create({
    data: {
      userId: user.id,
      token,
      expires,
    },
  })

  const emailResult = await sendPasswordResetEmail(user.email, token)
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`

  await writeAdminAuditLog({
    adminId: admin.id,
    action: 'reset_user_password',
    targetType: 'user',
    targetId: user.id,
    details: {
      emailSent: emailResult.success,
      emailError: emailResult.success ? null : emailResult.error,
      expiresAt: expires.toISOString(),
    },
  })

  return NextResponse.json({
    message: emailResult.success ? 'Password reset email sent' : 'Password reset token created',
    emailSent: emailResult.success,
    resetUrl,
    expiresAt: expires.toISOString(),
  })
}

export const POST = withErrorHandler(postAdminResetPasswordHandler)
