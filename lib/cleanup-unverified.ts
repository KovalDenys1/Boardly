import type { Prisma } from '@/prisma/client'
import { apiLogger } from './logger'
import { prisma } from './db'
import { sendUnverifiedAccountWarningEmail } from './email'
import { issueVerificationToken } from './auth-tokens'
import { RETENTION_DAYS } from './retention-periods'

const log = apiLogger('/cleanup/unverified-accounts')

/**
 * The accounts the unverified-email purge may warn and delete: never verified, not a
 * bot, no Google, GitHub or Discord sign-in (those need no email verification), and no
 * subscription (#1139). A customer is never deleted for an unverified address:
 * `stripeSubscriptionId` covers a subscription Stripe still holds, and a `premiumUntil`
 * still in the future covers paid time left after a cancellation and Premium given
 * any other way. Checkout now needs a verified address, so this guards the accounts
 * that bought before that rule.
 *
 * One definition for the warning, the deletion and scripts/cleanup-unverified.ts, so
 * nobody is warned about a deletion that will not happen, or deleted without the warning.
 */
export function purgeableUnverifiedAccountsWhere(now: Date = new Date()): Prisma.UsersWhereInput {
  return {
    emailVerified: null,
    bot: null,
    accounts: { none: {} },
    stripeSubscriptionId: null,
    OR: [{ premiumUntil: null }, { premiumUntil: { lte: now } }],
  }
}

function calculateDaysUntilDeletion(createdAt: Date, totalDaysBeforeDeletion: number): number {
  const accountAgeDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  const daysLeft = Math.ceil(totalDaysBeforeDeletion - accountAgeDays)
  return Math.max(0, daysLeft)
}

/**
 * Delete unverified accounts older than specified days
 * @param daysOld - Number of days after which unverified accounts should be deleted (default: 7)
 */
export async function cleanupUnverifiedAccounts(daysOld: number = RETENTION_DAYS.unverifiedAccounts) {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    log.info('Starting unverified accounts cleanup', {
      daysOld,
      cutoffDate: cutoffDate.toISOString()
    })

    // Find unverified accounts older than cutoff date. No bots, no OAuth users and no
    // customers: purgeableUnverifiedAccountsWhere.
    const unverifiedUsers = await prisma.users.findMany({
      where: {
        ...purgeableUnverifiedAccountsWhere(),
        createdAt: {
          lt: cutoffDate
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true
      }
    })

    if (unverifiedUsers.length === 0) {
      log.info('No unverified accounts to clean up')
      return {
        deleted: 0,
        users: []
      }
    }

    // Ids only: the addresses and names are exactly what this run deletes, and a log
    // line would keep them after the rows are gone (#1132).
    log.info('Found unverified accounts to delete', {
      count: unverifiedUsers.length,
      userIds: unverifiedUsers.map(u => u.id),
    })

    // Delete related records first (due to cascade, this should happen automatically, but being explicit)
    const userIds = unverifiedUsers.map(u => u.id)

    // Delete email verification tokens
    await prisma.emailVerificationTokens.deleteMany({
      where: { userId: { in: userIds } }
    })

    // Delete password reset tokens
    await prisma.passwordResetTokens.deleteMany({
      where: { userId: { in: userIds } }
    })

    // Delete the users (this will cascade delete sessions, players, etc.). The rule is
    // checked again here, so an account that subscribed or verified since the lookup
    // above is kept.
    const result = await prisma.users.deleteMany({
      where: {
        ...purgeableUnverifiedAccountsWhere(),
        id: { in: userIds }
      }
    })

    log.info('Unverified accounts deleted successfully', {
      deletedCount: result.count
    })

    return {
      deleted: result.count,
      users: unverifiedUsers.map(u => ({
        email: u.email,
        username: u.username,
        createdAt: u.createdAt
      }))
    }

  } catch (error) {
    log.error('Error during unverified accounts cleanup', error as Error)
    throw error
  }
}

/**
 * Send warning emails to unverified accounts approaching deletion
 * @param daysBeforeDeletion - Warn when account is this many days away from deletion (default: 2)
 * @param totalDaysBeforeDeletion - Total days before deletion (default: 7)
 */
export async function warnUnverifiedAccounts(
  daysBeforeDeletion: number = 2,
  totalDaysBeforeDeletion: number = 7
) {
  try {
    const warnDate = new Date()
    warnDate.setDate(warnDate.getDate() - (totalDaysBeforeDeletion - daysBeforeDeletion))

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - totalDaysBeforeDeletion)

    log.info('Checking for accounts needing warning', {
      warnDate: warnDate.toISOString(),
      cutoffDate: cutoffDate.toISOString()
    })

    // Find unverified accounts in warning window, under the same rule as the deletion:
    // an account the purge will not delete gets no deletion warning.
    const usersToWarn = await prisma.users.findMany({
      where: {
        ...purgeableUnverifiedAccountsWhere(),
        createdAt: {
          lt: warnDate,
          gte: cutoffDate
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true
      }
    })

    if (usersToWarn.length === 0) {
      log.info('No accounts need warning')
      return {
        warned: 0,
        users: []
      }
    }

    log.info('Found accounts to warn', {
      count: usersToWarn.length
    })

    const minVerificationTokenTtlHours = 24
    const tokenTtlHours = Math.max(minVerificationTokenTtlHours, daysBeforeDeletion * 24)

    const usersWithEmailStatus = await Promise.all(
      usersToWarn.map(async (user) => {
        const daysUntilDeletion = calculateDaysUntilDeletion(user.createdAt, totalDaysBeforeDeletion)
        const safeUsername = user.username || 'Player'

        if (!user.email) {
          log.warn('Skipping warning email for user without email', {
            userId: user.id,
          })

          return {
            email: user.email,
            username: user.username,
            createdAt: user.createdAt,
            daysUntilDeletion,
            emailSent: false,
            emailError: 'missing_email',
          }
        }

        try {
          await prisma.emailVerificationTokens.deleteMany({
            where: { userId: user.id },
          })

          // Only the hash is stored (#1141).
          const { token, tokenHash } = issueVerificationToken()
          const expires = new Date(Date.now() + tokenTtlHours * 60 * 60 * 1000)

          await prisma.emailVerificationTokens.create({
            data: {
              userId: user.id,
              tokenHash,
              expires,
            },
          })

          const emailResult = await sendUnverifiedAccountWarningEmail(
            user.email,
            token,
            safeUsername,
            daysUntilDeletion
          )

          return {
            email: user.email,
            username: user.username,
            createdAt: user.createdAt,
            daysUntilDeletion,
            emailSent: emailResult.success,
            emailError: emailResult.success ? undefined : (emailResult.error || 'email_send_failed'),
          }
        } catch (emailError) {
          log.error('Failed to send unverified account warning email', emailError as Error, {
            userId: user.id,
          })

          return {
            email: user.email,
            username: user.username,
            createdAt: user.createdAt,
            daysUntilDeletion,
            emailSent: false,
            emailError: emailError instanceof Error ? emailError.message : 'email_send_failed',
          }
        }
      })
    )

    const emailsSent = usersWithEmailStatus.filter((user) => user.emailSent).length
    const emailFailures = usersWithEmailStatus.length - emailsSent

    log.info('Unverified warning email run completed', {
      attempted: usersWithEmailStatus.length,
      emailsSent,
      emailFailures,
      tokenTtlHours,
    })

    return {
      warned: usersToWarn.length,
      emailsSent,
      emailFailures,
      users: usersWithEmailStatus,
    }

  } catch (error) {
    log.error('Error during unverified accounts warning', error as Error)
    throw error
  }
}
