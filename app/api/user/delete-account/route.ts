import { NextRequest, NextResponse } from 'next/server'
import { optionalSessionUser } from '@/lib/session-user'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { verifyCsrfToken } from '@/lib/csrf'
import { findPasswordResetToken } from '@/lib/auth-tokens'
import { deleteUserAccount } from '@/lib/account-deletion'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/user/delete-account')

export async function POST(req: NextRequest) {
  if (!verifyCsrfToken(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  try {
    const { token } = await req.json()

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // By hash, and only a token issued for deletion: a password reset token posted
    // here finds nothing (#1141).
    const deletionToken = typeof token === 'string' ? await findPasswordResetToken(token, 'delete') : null

    if (!deletionToken) {
      return NextResponse.json(
        { error: 'Invalid or expired deletion token' },
        { status: 400 }
      )
    }

    // If the caller is authenticated, they must own the account being deleted.
    // allowSuspended: erasure stays available to a suspended account (GDPR
    // Art. 17); the session is only an extra ownership check here.
    const auth = await optionalSessionUser(req, { allowSuspended: true })
    if ('response' in auth) {
      return auth.response
    }
    const { session } = auth
    if (session?.user?.id && session.user.id !== deletionToken.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (deletionToken.expires < new Date()) {
      await prisma.passwordResetTokens.delete({
        where: { id: deletionToken.id }
      })
      return NextResponse.json(
        { error: 'Deletion token has expired' },
        { status: 400 }
      )
    }

    // The same path the inactivity rule deletes by (lib/account-deletion.ts, #1130).
    // Everything that can fail runs before anything is deleted, the deletion token
    // included, so a failure answers "try again" and the same link still works.
    const result = await deleteUserAccount(deletionToken.userId, { reason: 'owner_request', log })

    switch (result.status) {
      case 'not_found':
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      case 'bot':
        return NextResponse.json({ error: 'Bot accounts cannot be deleted' }, { status: 400 })
      case 'avatar_failed':
        return NextResponse.json(
          { error: 'Could not remove your profile picture. Please try again shortly.' },
          { status: 502 }
        )
      case 'subscription_failed':
        return NextResponse.json(
          { error: 'Could not cancel your subscription. Please try again shortly.' },
          { status: 502 }
        )
      case 'deleted':
        return NextResponse.json({
          success: true,
          message: 'Account deleted successfully'
        })
    }
  } catch (error) {
    log.error('Error deleting account', error as Error)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
