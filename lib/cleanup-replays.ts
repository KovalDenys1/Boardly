import { GameStatus } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { MAX_SNAPSHOTS_PER_GAME } from '@/lib/game-replay'
import { RETENTION_DAYS } from '@/lib/retention-periods'

const log = apiLogger('cleanup-replays')
const DEFAULT_REPLAY_RETENTION_DAYS = RETENTION_DAYS.replays

export interface ReplayCleanupResult {
  deleted: number
  retentionDays: number
  cutoffDate: string
}

function resolveRetentionDays(rawValue: string | undefined): number {
  if (!rawValue) return DEFAULT_REPLAY_RETENTION_DAYS
  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REPLAY_RETENTION_DAYS
  }
  return parsed
}

export async function cleanupOldReplaySnapshots(
  days = resolveRetentionDays(process.env.REPLAY_RETENTION_DAYS)
): Promise<ReplayCleanupResult> {
  const retentionDays = Math.max(1, Math.floor(days))
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  const result = await prisma.gameStateSnapshots.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
      game: {
        status: {
          in: [GameStatus.finished, GameStatus.abandoned, GameStatus.cancelled],
        },
      },
    },
  })

  log.info('Old replay snapshots cleanup completed', {
    deleted: result.count,
    retentionDays,
    cutoffDate: cutoffDate.toISOString(),
  })

  return {
    deleted: result.count,
    retentionDays,
    cutoffDate: cutoffDate.toISOString(),
  }
}

export interface ReplayOverflowCleanupResult {
  deletedSnapshots: number
  affectedGames: number
}

/**
 * Enforces the per-game snapshot cap (MAX_SNAPSHOTS_PER_GAME). Used to run
 * inline on every single move write; moved here since <1% of games ever
 * approach the cap, so it doesn't need to be on the per-move hot path.
 */
export async function cleanupOversizedReplaySnapshots(): Promise<ReplayOverflowCleanupResult> {
  const overflowGames = await prisma.gameStateSnapshots.groupBy({
    by: ['gameId'],
    _count: { id: true },
    having: { id: { _count: { gt: MAX_SNAPSHOTS_PER_GAME } } },
  })

  let deletedSnapshots = 0

  for (const { gameId } of overflowGames) {
    const overflow = await prisma.gameStateSnapshots.findMany({
      where: { gameId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
      skip: MAX_SNAPSHOTS_PER_GAME,
    })

    if (overflow.length === 0) continue

    const result = await prisma.gameStateSnapshots.deleteMany({
      where: { id: { in: overflow.map((snapshot) => snapshot.id) } },
    })
    deletedSnapshots += result.count
  }

  log.info('Oversized replay snapshot cleanup completed', {
    deletedSnapshots,
    affectedGames: overflowGames.length,
  })

  return { deletedSnapshots, affectedGames: overflowGames.length }
}
