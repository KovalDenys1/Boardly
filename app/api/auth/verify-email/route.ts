import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
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

    await prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: new Date() },
    })

    await prisma.emailVerificationToken.delete({
      where: { token },
    })

    return NextResponse.json({ message: 'Email verified successfully' })
  } catch (error) {
    const log = apiLogger('POST /api/auth/verify-email')
    log.error('Email verification error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
