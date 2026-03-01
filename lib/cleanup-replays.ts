import { GameStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('cleanup-replays')
const DEFAULT_REPLAY_RETENTION_DAYS = 90

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
