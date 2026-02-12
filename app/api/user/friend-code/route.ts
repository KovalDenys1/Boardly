import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { ensureUserHasFriendCode } from '@/lib/friend-code'
import { apiLogger } from '@/lib/logger'
import {
  AuthenticationError,
  AuthorizationError,
  withErrorHandler,
} from '@/lib/error-handler'

export const runtime = 'nodejs'
// Force dynamic rendering (uses headers)
export const dynamic = 'force-dynamic'
const log = apiLogger('/api/user/friend-code')

/**
 * GET /api/user/friend-code
 * Get or generate user's friend code
 */
async function getFriendCodeHandler(_req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }

  // Check if email is verified
  if (!session.user.emailVerified) {
    log.warn('Friend code access denied - email not verified', { userId: session.user.id })
    throw new AuthorizationError('Email verification required')
  }

  const friendCode = await ensureUserHasFriendCode(session.user.id)

  log.info('Friend code retrieved', { userId: session.user.id })

  return NextResponse.json({ friendCode })
}

export const GET = withErrorHandler(getFriendCodeHandler)
