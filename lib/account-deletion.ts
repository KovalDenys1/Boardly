import type { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getStripe } from '@/lib/stripe'
import { clearRoleConnection } from '@/lib/discord/role-connection'
import { deleteAvatar, isAvatarStorageConfigured } from '@/lib/supabase-storage'
import { detachFeedbackFrom, scrubPlayersFromGameRecords } from '@/lib/account-erasure'

/**
 * Deleting a registered account, in one place (#1130).
 *
 * Two callers: the owner's own request (`/api/user/delete-account`, after the email
 * confirmation) and the 24-month inactivity rule (lib/inactive-accounts.ts). Both take the
 * same path, so an account the rule deletes loses exactly what one deleted by its owner
 * does: the avatar, the Stripe subscription and customer, the Discord linked-role data,
 * its name in other players' games and replays, the link from its feedback, and then the
 * row with everything that cascades from it. Only ids are logged (#1128).
 */

export type AccountDeletionReason = 'owner_request' | 'inactivity'

export type AccountDeletionResult =
  | { status: 'deleted' }
  /** No such account, or it no longer matches the caller's guard. Nothing was changed. */
  | { status: 'not_found' }
  | { status: 'bot' }
  /** The avatar could not be removed. Nothing was changed; safe to retry. */
  | { status: 'avatar_failed' }
  /** The subscription could not be cancelled. Nothing but the avatar was changed; safe to retry. */
  | { status: 'subscription_failed' }

type Logger = ReturnType<typeof apiLogger>

export interface AccountDeletionOptions {
  reason: AccountDeletionReason
  /**
   * Conditions the account must still meet. They are checked twice, not continuously: when
   * the row is read at the start, and in the final delete statement. The inactivity rule
   * passes its own rule here, pinned to the lastActiveAt and warning it read.
   *
   * - An account that stops matching before the read (a sign-in, a subscription) is not
   *   touched at all.
   * - One that stops matching in the seconds between the read and the final delete keeps
   *   its row and its sign-in, but not what the steps in between already removed: the
   *   avatar, the Discord linked-role data, its name in other players' games and replays,
   *   the link from its feedback, its password-reset and verification tokens, friend
   *   requests and friendships. Stripe is not among them for the inactivity rule, which
   *   never selects an account with a Stripe customer or subscription. The result is
   *   `not_found` and the caller logs it; nothing puts the removed parts back.
   */
  guard?: Prisma.UsersWhereInput
  log?: Logger
}

function isStripeResourceMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err &&
    (err as { code?: string }).code === 'resource_missing'
}

export async function deleteUserAccount(
  userId: string,
  options: AccountDeletionOptions
): Promise<AccountDeletionResult> {
  const log = options.log ?? apiLogger('account-deletion')
  const { reason, guard } = options

  const select = {
    id: true,
    email: true,
    username: true,
    bot: true,
    stripeCustomerId: true,
    stripeSubscriptionId: true,
  } as const
  const user = guard
    ? await prisma.users.findFirst({ where: { AND: [{ id: userId }, guard] }, select })
    : await prisma.users.findUnique({ where: { id: userId }, select })

  if (!user) return { status: 'not_found' }
  if (user.bot) return { status: 'bot' }

  // Only the id is logged, here and below: a deletion log line carrying the
  // email or username would keep exactly what the deletion removes (#1128).
  log.info('Starting account deletion', { userId: user.id, reason })

  // Everything that can fail and must not be half-done runs before anything
  // is deleted, so a failure answers "try again" and a retry starts clean.

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
        { userId: user.id, reason }
      )
      return { status: 'avatar_failed' }
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
        return { status: 'subscription_failed' }
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

  await prisma.passwordResetTokens.deleteMany({ where: { userId: user.id } })
  await prisma.emailVerificationTokens.deleteMany({ where: { userId: user.id } })
  await prisma.friendRequests.deleteMany({
    where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
  })
  await prisma.friendships.deleteMany({
    where: { OR: [{ user1Id: user.id }, { user2Id: user.id }] },
  })

  // The user row; sessions, accounts, players, lobbies and the rest cascade. Under a guard
  // the rule is checked once more in the same statement.
  if (guard) {
    const deleted = await prisma.users.deleteMany({ where: { AND: [{ id: user.id }, guard] } })
    if (deleted.count === 0) {
      // See AccountDeletionOptions.guard: the row stays, what was removed above does not
      // come back.
      log.warn('Account stopped matching its deletion rule mid-deletion; row kept, partly erased', {
        userId: user.id,
        reason,
      })
      return { status: 'not_found' }
    }
  } else {
    await prisma.users.delete({ where: { id: user.id } })
  }

  log.info('Account deleted successfully', { userId: user.id, reason })
  return { status: 'deleted' }
}
