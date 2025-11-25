import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import crypto from 'crypto'
import { apiLogger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: 'Email already verified' }, { status: 400 })
    }

    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    })

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expires,
      },
    })

    await sendVerificationEmail(email, token)

    return NextResponse.json({ message: 'Verification email sent' })
  } catch (error) {
    const log = apiLogger('POST /api/auth/resend-verification')
    log.error('Resend verification error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
