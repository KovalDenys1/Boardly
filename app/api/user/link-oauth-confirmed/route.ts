import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { signIn } from 'next-auth/react'

const log = apiLogger('Manual OAuth Link')

/**
 * POST /api/user/link-oauth-confirmed
 * 
 * Manually link OAuth account to current user even if emails differ
 * This endpoint is used when user explicitly confirms linking from /auth/link page
 * 
 * Flow:
 * 1. User clicks "Link Google" in profile
 * 2. Goes to /auth/link?provider=google with warning
 * 3. Confirms linking
 * 4. This endpoint stores "pending link" flag
 * 5. Redirects to OAuth
 * 6. After OAuth callback, checks flag and links manually
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

    const { provider, confirmed } = await request.json()

    if (!provider || !confirmed) {
      return NextResponse.json(
        { error: 'Provider and confirmation required' },
        { status: 400 }
      )
    }

    if (!['google', 'github', 'discord'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      )
    }

    // Get current user
    const user = await prisma.user.findUnique({
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

    // Store pending link in database (temporary table or user preferences)
    // For now, we'll use a simpler approach - return authorization URL
    // The user will be redirected to OAuth and we'll handle it in callback
    
    log.info('Manual OAuth link initiated', {
      userId: user.id,
      provider,
      userEmail: session.user.email
    })

    // Return success - client will redirect to OAuth
    return NextResponse.json({
      success: true,
      message: 'Ready to link account',
      redirectUrl: `/api/auth/signin/${provider}?callbackUrl=/profile?linked=${provider}`
    })

  } catch (error) {
    log.error('Failed to initiate manual OAuth link', error as Error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
