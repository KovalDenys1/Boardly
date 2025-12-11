import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('Link OAuth Account')

/**
 * POST /api/user/link-oauth
 * Links an OAuth provider account to the currently logged-in user
 * even if the OAuth email doesn't match the user's email
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { provider, providerAccountId, email: oauthEmail } = body

    if (!provider || !providerAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const currentUserId = session.user.id

    // Check if this OAuth account is already linked to another user
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId
        }
      },
      include: {
        user: true
      }
    })

    if (existingAccount) {
      if (existingAccount.userId === currentUserId) {
        return NextResponse.json(
          { error: 'This account is already linked to your profile' },
          { status: 400 }
        )
      }

      // OAuth account belongs to a different user
      // Ask user to confirm merging accounts
      return NextResponse.json(
        { 
          error: 'Account already exists',
          message: `This ${provider} account is already registered with email ${existingAccount.user.email}. Would you like to merge these accounts?`,
          requiresMerge: true,
          existingUserId: existingAccount.userId,
          existingEmail: existingAccount.user.email
        },
        { status: 409 }
      )
    }

    // Check if there's a user with the OAuth email who doesn't have this provider linked
    const userWithOAuthEmail = await prisma.user.findUnique({
      where: { email: oauthEmail },
      include: {
        accounts: true
      }
    })

    if (userWithOAuthEmail && userWithOAuthEmail.id !== currentUserId) {
      // There's another user with this email - ask for confirmation
      return NextResponse.json(
        { 
          error: 'Email already registered',
          message: `Another account exists with email ${oauthEmail}. Linking this ${provider} account will associate both emails with your current profile.`,
          requiresConfirmation: true,
          conflictEmail: oauthEmail
        },
        { status: 409 }
      )
    }

    log.info('OAuth account link requested', {
      userId: currentUserId,
      provider,
      oauthEmail
    })

    return NextResponse.json({
      success: true,
      message: 'Ready to link account',
      requiresConfirmation: userWithOAuthEmail ? true : false
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error('Failed to process OAuth linking')
    console.error('OAuth linking error:', errorMessage)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
