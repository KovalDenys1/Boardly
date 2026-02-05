import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword, createToken } from '@/lib/auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/email'
import { nanoid } from 'nanoid'
import { apiLogger } from '@/lib/logger'
import { registerSchema } from '@/lib/validation/auth'
import { z } from 'zod'

const limiter = rateLimit(rateLimitPresets.auth)

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const body = await request.json()
    const { email, username, password } = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.users.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email or username already exists' },
        { status: 400 }
      )
    }

    // Create user
    const passwordHash = await hashPassword(password)
    
    // Check if username already exists
    const existingUsername = await prisma.users.findUnique({
      where: { username },
    })
    
    if (existingUsername) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 400 }
      )
    }
    
    const user = await prisma.users.create({
      data: {
        email,
        username,
        passwordHash,
        // emailVerified will be set when user clicks verification link
      },
    })

    // Generate verification token
    const verificationToken = nanoid(32)
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await prisma.emailVerificationTokens.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expires: verificationExpiry,
      },
    })

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verificationToken)
    
    if (!emailResult.success) {
      const log = apiLogger('POST /api/auth/register')
      log.error('Failed to send verification email', undefined, { error: emailResult.error })
      // Continue anyway - user can request resend
    }

    return NextResponse.json({
      message: 'Registration successful! Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email ?? email,
        username: user.username,
        emailVerified: false,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    const log = apiLogger('POST /api/auth/register')
    log.error('Register error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
