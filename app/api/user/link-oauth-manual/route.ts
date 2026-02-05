import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('Manual OAuth Link')

/**
 * POST /api/user/link-oauth-manual
 * 
 * BEST SOLUTION for linking OAuth with different email:
 * This endpoint manually creates Account record and links it to current user
 * 
 * Problem: NextAuth creates NEW user if OAuth email differs
 * Solution: Bypass NextAuth, manually link Account after OAuth callback
 * 
 * Flow:
 * 1. User clicks "Link Google" in profile
 * 2. /auth/link shows warning dialog
 * 3. User confirms
 * 4. Call this endpoint with provider
 * 5. This sets a cookie/session flag "pendingLink=google&userId=xxx"
 * 6. Redirect to NextAuth OAuth
 * 7. After OAuth callback, NextAuth middleware checks flag
 * 8. If flag exists, manually create Account record with current userId
 * 9. Success!
 * 
 * This requires middleware to intercept OAuth callback
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { provider } = await request.json()

    if (!provider || !['google', 'github', 'discord'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      )
    }

    // Get current user
    const user = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        accounts: {
          select: { provider: true }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if already linked
    const alreadyLinked = user.accounts.some(acc => acc.provider === provider)
    if (alreadyLinked) {
      return NextResponse.json(
        { error: `${provider} account already linked` },
        { status: 400 }
      )
    }

    log.info('Manual OAuth link prepared', {
      userId: user.id,
      provider,
      userEmail: session.user.email
    })

    // Set cookie for NextAuth callback to detect linking scenario
    const response = NextResponse.json({
      success: true,
      message: 'Ready to link account',
      oauthUrl: `/api/auth/signin/${provider}?callbackUrl=/profile?linked=${provider}`
    })

    // Store pending link info in cookie (expires in 10 minutes)
    response.cookies.set('pendingOAuthLink', JSON.stringify({
      userId: user.id,
      provider,
      timestamp: Date.now()
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600 // 10 minutes
    })

    return response

  } catch (error) {
    log.error('Failed to prepare manual OAuth link', error as Error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
