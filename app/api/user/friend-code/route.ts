import { NextRequest, NextResponse } from 'next/server'
import { ensureUserHasFriendCode } from '@/lib/friend-code'
import { ensureUserHasPublicProfileId } from '@/lib/public-profile.server'
import { apiLogger } from '@/lib/logger'
import {
  AuthorizationError,
  withErrorHandler,
} from '@/lib/error-handler'
import { getSessionUserOrThrow } from '@/lib/session-user'

export const runtime = 'nodejs'
// Force dynamic rendering (uses headers)
export const dynamic = 'force-dynamic'
const log = apiLogger('/api/user/friend-code')

/**
 * GET /api/user/friend-code
 * Get or generate user's friend code
 */
async function getFriendCodeHandler(req: NextRequest) {
  const { session } = await getSessionUserOrThrow(req)

  // Check if email is verified
  if (!session.user.emailVerified) {
    log.warn('Friend code access denied - email not verified', { userId: session.user.id })
    throw new AuthorizationError('Email verification required')
  }

  const [friendCode, publicProfileId] = await Promise.all([
    ensureUserHasFriendCode(session.user.id),
    ensureUserHasPublicProfileId(session.user.id),
  ])

  log.info('Friend code retrieved', { userId: session.user.id })

  return NextResponse.json({ friendCode, publicProfileId })
}

export const GET = withErrorHandler(getFriendCodeHandler)
