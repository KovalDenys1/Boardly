#!/usr/bin/env tsx
/**
 * Cleanup abandoned games older than N days.
 *
 * Usage:
 *   npm run cleanup:abandoned-games
 *   npm run cleanup:abandoned-games -- --days=7
 *   npm run cleanup:abandoned-games -- --dry-run
 */

import { prisma } from '../lib/db'
import { apiLogger as log } from '../lib/logger'

const logger = log('cleanup-abandoned-games')
const DEFAULT_DAYS_TO_KEEP = 7

interface CleanupAbandonedOptions {
  daysToKeep?: number
  dryRun?: boolean
  disconnect?: boolean
}

interface CleanupEmptyLobbiesOptions {
  dryRun?: boolean
}

export interface CleanupAbandonedResult {
  candidates: number
  deletedGames: number
  deletedEmptyLobbies: number
  daysToKeep: number
  cutoffDate: string
  dryRun: boolean
}

function resolveDaysToKeep(rawDays: number | undefined): number {
  if (!Number.isFinite(rawDays) || (rawDays as number) <= 0) {
    return DEFAULT_DAYS_TO_KEEP
  }

  return Math.floor(rawDays as number)
}

async function cleanupEmptyLobbies(options: CleanupEmptyLobbiesOptions = {}): Promise<number> {
  const dryRun = options.dryRun === true

  logger.info('Cleaning up empty lobbies', { dryRun })

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
    return 0
  }

  if (dryRun) {
    logger.info(`Dry run: found ${emptyLobbies.length} empty lobbies`, {
      count: emptyLobbies.length,
    })
    return 0
  }

  const result = await prisma.lobbies.deleteMany({
    where: {
      id: {
        in: emptyLobbies.map((lobby) => lobby.id),
      },
    },
  })

  logger.info('Empty lobbies cleaned up', {
    deletedCount: result.count,
  })

  return result.count
}

export async function cleanupAbandonedGames(options: CleanupAbandonedOptions = {}): Promise<CleanupAbandonedResult> {
  const daysToKeep = resolveDaysToKeep(options.daysToKeep)
  const dryRun = options.dryRun ?? process.argv.includes('--dry-run')
  const shouldDisconnect = options.disconnect ?? true

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  try {
    logger.info('Starting cleanup of abandoned games', {
      daysToKeep,
      dryRun,
      cutoffDate: cutoffDate.toISOString(),
    })

    // Prefer abandonedAt when present and fall back to updatedAt for legacy rows.
    const abandonedGames = await prisma.games.findMany({
      where: {
        status: 'abandoned',
        OR: [
          {
            abandonedAt: {
              lt: cutoffDate,
            },
          },
          {
            abandonedAt: null,
            updatedAt: {
              lt: cutoffDate,
            },
          },
        ],
      },
      select: {
        id: true,
        lobbyId: true,
        abandonedAt: true,
        updatedAt: true,
      },
    })

    if (abandonedGames.length === 0) {
      logger.info('No abandoned games to cleanup')
      return {
        candidates: 0,
        deletedGames: 0,
        deletedEmptyLobbies: 0,
        daysToKeep,
        cutoffDate: cutoffDate.toISOString(),
        dryRun,
      }
    }

    logger.info(`Found ${abandonedGames.length} abandoned games to cleanup`, {
      count: abandonedGames.length,
      cutoffDate: cutoffDate.toISOString(),
      dryRun,
    })

    if (dryRun) {
      logger.info('Dry run enabled — no abandoned games will be deleted')
      return {
        candidates: abandonedGames.length,
        deletedGames: 0,
        deletedEmptyLobbies: 0,
        daysToKeep,
        cutoffDate: cutoffDate.toISOString(),
        dryRun: true,
      }
    }

    const result = await prisma.games.deleteMany({
      where: {
        id: {
          in: abandonedGames.map((game) => game.id),
        },
      },
    })

    logger.info('Abandoned games cleaned up', {
      deletedCount: result.count,
    })

    const deletedEmptyLobbies = await cleanupEmptyLobbies()

    return {
      candidates: abandonedGames.length,
      deletedGames: result.count,
      deletedEmptyLobbies,
      daysToKeep,
      cutoffDate: cutoffDate.toISOString(),
      dryRun: false,
    }
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect()
    }
  }
}

const isMain = typeof require !== 'undefined' && require.main === module

if (isMain) {
  const daysArg = process.argv.find((arg) => arg.startsWith('--days='))
  const parsedDays = daysArg ? Number.parseInt(daysArg.split('=')[1], 10) : undefined
  const dryRun = process.argv.includes('--dry-run')

  cleanupAbandonedGames({
    daysToKeep: parsedDays,
    dryRun,
    disconnect: true,
  })
    .then((result) => {
      logger.info('Cleanup script finished', result)
      process.exit(0)
    })
    .catch((error) => {
      logger.error('Cleanup script failed', error as Error)
      process.exit(1)
    })
}
