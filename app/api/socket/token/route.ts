import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import jwt from 'jsonwebtoken'

/**
 * Generate a short-lived JWT token for Socket.IO authentication
 * Required when socket server is on different domain (Vercel → Render)
 */
export async function GET(request: NextRequest) {
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
