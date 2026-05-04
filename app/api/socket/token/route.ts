import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import jwt from 'jsonwebtoken'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.api)

export async function GET(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Generate short-lived token (5 minutes)
    const token = jwt.sign(
      {
        userId: session.user.id,
        id: session.user.id,
        email: session.user.email,
        iat: Math.floor(Date.now() / 1000),
      },
      secret,
      { expiresIn: '5m' }
    )

    return NextResponse.json({ token })
  } catch (error) {
    console.error('Failed to generate socket token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
