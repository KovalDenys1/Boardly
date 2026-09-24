import { NextRequest, NextResponse } from 'next/server'
import { optionalSessionUser } from '@/lib/session-user'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { verifyCsrfToken } from '@/lib/csrf'
import { getStripe } from '@/lib/stripe'
import { clearRoleConnection } from '@/lib/discord/role-connection'
import { deleteAvatar, isAvatarStorageConfigured } from '@/lib/supabase-storage'
import { detachFeedbackFrom, scrubPlayersFromGameRecords } from '@/lib/account-erasure'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/user/delete-account')

function isStripeResourceMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err &&
    (err as { code?: string }).code === 'resource_missing'
}

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

    // Find deletion token (with DELETE_ prefix)
    const deletionToken = await prisma.passwordResetTokens.findUnique({
      where: { token: `DELETE_${token}` }
    })

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
        where: { token: `DELETE_${token}` }
      })
      return NextResponse.json(
        { error: 'Deletion token has expired' },
        { status: 400 }
      )
    }

    // Get user details before deletion
    const user = await prisma.users.findUnique({
      where: { id: deletionToken.userId },
      select: {
        id: true,
        email: true,
        username: true,
        bot: true,  // Bot relation
        stripeCustomerId: true,
        stripeSubscriptionId: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.bot) {
      return NextResponse.json(
        { error: 'Bot accounts cannot be deleted' },
        { status: 400 }
      )
    }

    // Only the id is logged, here and below: a deletion log line carrying the
    // email or username would keep exactly what the deletion removes (#1128).
    log.info('Starting account deletion', { userId: user.id })

    // Everything that can fail and must not be half-done runs before anything
    // is deleted, the deletion token included, so a failure answers "try again"
    // and the same confirmation link still works.

    // The avatar sits in a public bucket under the user's id. Nothing links to
    // it once the row is gone, but the URL keeps serving the image to anyone who
    // kept it, so a failed removal refuses the deletion (#1128).
    if (isAvatarStorageConfigured()) {
      try {
        await deleteAvatar(user.id)
      } catch (err) {
        log.error(
          'Refusing to delete an account whose avatar could not be removed',
          err instanceof Error ? err : new Error(String(err)),
          { userId: user.id }
        )
        return NextResponse.json(
          { error: 'Could not remove your profile picture. Please try again shortly.' },
          { status: 502 }
        )
      }
    }

    // Cancel billing BEFORE the row goes, and fail closed if that does not work.
    // stripeCustomerId and stripeSubscriptionId live on Users, so deleting the
    // row destroys the only mapping we have while the subscription in Stripe
    // stays active: the person keeps being charged, cannot sign in to stop it,
    // and no query of ours can even find them afterwards (#827). A user who
    // stays deletable is recoverable; a silently billed ghost is not.
    if (user.stripeSubscriptionId) {
      try {
        await getStripe().subscriptions.cancel(user.stripeSubscriptionId)
        log.info('Cancelled Stripe subscription before account deletion', {
          userId: user.id,
          subscriptionId: user.stripeSubscriptionId,
        })
      } catch (err) {
        if (!isStripeResourceMissing(err)) {
          log.error(
            'Refusing to delete an account whose subscription could not be cancelled',
            err instanceof Error ? err : new Error(String(err)),
            { userId: user.id, subscriptionId: user.stripeSubscriptionId }
          )
          return NextResponse.json(
            { error: 'Could not cancel your subscription. Please try again shortly.' },
            { status: 502 }
          )
        }
      }
    }

    // Then the customer object, which holds the name and email collected at
    // checkout (#1128). Not fail-closed: billing is already stopped above, and a
    // retry would trip over the subscription that is now cancelled. A failure is
    // logged with the customer id so it can be finished by hand.
    if (user.stripeCustomerId) {
      try {
        await getStripe().customers.del(user.stripeCustomerId)
        log.info('Deleted Stripe customer before account deletion', { userId: user.id })
      } catch (err) {
        if (!isStripeResourceMissing(err)) {
          log.error(
            'Stripe customer could not be deleted; delete it by hand',
            err instanceof Error ? err : new Error(String(err)),
            { userId: user.id, stripeCustomerId: user.stripeCustomerId }
          )
        }
      }
    }

    // Empty the Discord Linked Roles metadata before the Accounts cascade takes the token
    // with it – afterwards nothing could authenticate the write and the roles would stay
    // granted on a deleted account (#939). Never throws, so it cannot block the deletion.
    const cleared = await clearRoleConnection(user.id)
    log.info('Discord role connection clear before account deletion', {
      userId: user.id,
      status: cleared.status,
    })

    // Other players' games and replays keep this person's name in Games.state
    // and the snapshots, and Feedback keeps their address; the cascade reaches
    // neither (#1128).
    const scrubbed = await scrubPlayersFromGameRecords([{ id: user.id, username: user.username }])
    const feedbackDetached = await detachFeedbackFrom([user.id], user.email)
    log.info('Scrubbed game records and feedback before account deletion', {
      userId: user.id,
      games: scrubbed.games,
      snapshots: scrubbed.snapshots,
      feedback: feedbackDetached,
    })

    // Delete tokens
    await prisma.passwordResetTokens.deleteMany({
      where: { userId: user.id }
    })
    await prisma.emailVerificationTokens.deleteMany({
      where: { userId: user.id }
    })

    // Delete friend requests (sent and received)
    await prisma.friendRequests.deleteMany({
      where: {
        OR: [
          { senderId: user.id },
          { receiverId: user.id }
        ]
      }
    })

    // Delete friendships
    await prisma.friendships.deleteMany({
      where: {
        OR: [
          { user1Id: user.id },
          { user2Id: user.id }
        ]
      }
    })

    // Delete the user (this will cascade delete sessions, accounts, players, lobbies)
    await prisma.users.delete({
      where: { id: user.id }
    })

    log.info('Account deleted successfully', { userId: user.id })

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully'
    })

  } catch (error) {
    log.error('Error deleting account', error as Error)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
