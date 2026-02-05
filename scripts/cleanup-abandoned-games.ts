/**
 * Cron job to cleanup abandoned games older than 7 days
 * 
 * Run this script periodically (e.g., daily via cron, GitHub Actions, or Vercel cron)
 * to delete old abandoned games and free up database space.
 * 
 * Usage:
 *   node scripts/cleanup-abandoned-games.js
 * 
 * Or via package.json script:
 *   npm run cleanup:abandoned-games
 */

import { prisma } from '../lib/db'
import { apiLogger as log } from '../lib/logger'

const logger = log('cleanup-abandoned-games')

const DAYS_TO_KEEP = 7 // Keep abandoned games for 7 days before deletion

async function cleanupAbandonedGames() {
  try {
    logger.info('Starting cleanup of abandoned games')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP)

    // Find abandoned games older than cutoff date
    // Note: Using updatedAt instead of abandonedAt due to TypeScript cache issue
    // After TS server restart, replace with abandonedAt
    const abandonedGames = await prisma.games.findMany({
      where: {
        status: 'abandoned',
        updatedAt: {
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        lobbyId: true,
        updatedAt: true,
      },
    })

    if (abandonedGames.length === 0) {
      logger.info('No abandoned games to cleanup')
      return
    }

    logger.info(`Found ${abandonedGames.length} abandoned games to delete`, {
      count: abandonedGames.length,
      cutoffDate: cutoffDate.toISOString(),
    })

    // Delete games (cascade will delete related players)
    const result = await prisma.games.deleteMany({
      where: {
        id: {
          in: abandonedGames.map((g: any) => g.id),
        },
      },
    })

    logger.info('Cleanup completed successfully', {
      deletedCount: result.count,
    })

    // Also cleanup empty lobbies (optional)
    await cleanupEmptyLobbies()
  } catch (error) {
    logger.error('Error during cleanup', error as Error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

async function cleanupEmptyLobbies() {
  try {
    logger.info('Cleaning up empty lobbies')

    // Find lobbies with no active games
    const emptyLobbies = await prisma.lobbies.findMany({
      where: {
        isActive: false,
        games: {
          none: {},
        },
      },
      select: {
        id: true,
        code: true,
      },
    })

    if (emptyLobbies.length === 0) {
      logger.info('No empty lobbies to cleanup')
      return
    }

    logger.info(`Found ${emptyLobbies.length} empty lobbies to delete`)

    const result = await prisma.lobbies.deleteMany({
      where: {
        id: {
          in: emptyLobbies.map((l: any) => l.id),
        },
      },
    })

    logger.info('Empty lobbies cleaned up', {
      deletedCount: result.count,
    })
  } catch (error) {
    logger.error('Error cleaning up empty lobbies', error as Error)
  }
}

// Run cleanup
cleanupAbandonedGames()
  .then(() => {
    logger.info('Cleanup script finished')
    process.exit(0)
  })
  .catch((error) => {
    logger.error('Cleanup script failed', error)
    process.exit(1)
  })
