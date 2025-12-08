import { PrismaClient } from '@prisma/client'
import { apiLogger } from './logger'

const prisma = new PrismaClient()
const log = apiLogger('/cleanup/unverified-accounts')

/**
 * Delete unverified accounts older than specified days
 * @param daysOld - Number of days after which unverified accounts should be deleted (default: 7)
 */
export async function cleanupUnverifiedAccounts(daysOld: number = 7) {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    log.info('Starting unverified accounts cleanup', {
      daysOld,
      cutoffDate: cutoffDate.toISOString()
    })

    // Find unverified accounts older than cutoff date
    const unverifiedUsers = await prisma.user.findMany({
      where: {
        emailVerified: null,
        createdAt: {
          lt: cutoffDate
        },
        isBot: false, // Don't delete bot accounts
        // Don't delete OAuth users (they don't need email verification)
        accounts: {
          none: {}
        }
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

    log.info('Found unverified accounts to delete', {
      count: unverifiedUsers.length,
      users: unverifiedUsers.map(u => ({
        email: u.email,
        username: u.username,
        createdAt: u.createdAt
      }))
    })

    // Delete related records first (due to cascade, this should happen automatically, but being explicit)
    const userIds = unverifiedUsers.map(u => u.id)

    // Delete email verification tokens
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: { in: userIds } }
    })

    // Delete password reset tokens
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } }
    })

    // Delete the users (this will cascade delete sessions, players, etc.)
    const result = await prisma.user.deleteMany({
      where: {
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

    // Find unverified accounts in warning window
    const usersToWarn = await prisma.user.findMany({
      where: {
        emailVerified: null,
        createdAt: {
          lt: warnDate,
          gte: cutoffDate
        },
        isBot: false,
        accounts: {
          none: {}
        }
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

    // TODO: Send warning emails
    // For now, just log the accounts that would be warned
    // You can integrate with your email service here

    return {
      warned: usersToWarn.length,
      users: usersToWarn.map(u => ({
        email: u.email,
        username: u.username,
        createdAt: u.createdAt,
        daysUntilDeletion: Math.ceil(
          (totalDaysBeforeDeletion - 
            (Date.now() - u.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        )
      }))
    }

  } catch (error) {
    log.error('Error during unverified accounts warning', error as Error)
    throw error
  }
}
