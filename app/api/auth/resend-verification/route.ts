import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import crypto from 'crypto'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/auth/resend-verification')

export async function POST(request: NextRequest) {
  try {
    await limiter(request)

    // Try to get session first (for logged-in users)
    const session = await getServerSession(authOptions)
    
    let email: string | undefined

    if (session?.user?.email) {
      // User is logged in, use their session email
      email = session.user.email
    } else {
      // User is not logged in, get email from request body
      const body = await request.json()
      email = body.email
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        username: true
      }
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
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expires,
      },
    })

    await sendVerificationEmail(email, token, user.username || 'User')

    log.info('Verification email resent', { userId: user.id, email })

    return NextResponse.json({ 
      success: true,
      message: 'Verification email sent' 
    })
  } catch (error) {
    log.error('Resend verification error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
