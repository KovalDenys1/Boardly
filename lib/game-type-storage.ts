import type { GameType as PrismaGameType } from '@prisma/client'

const PERSISTED_GAME_TYPES = new Set<PrismaGameType>([
  'yahtzee',
  'tic_tac_toe',
  'rock_paper_scissors',
  'memory',
  'chess',
  'guess_the_spy',
  'uno',
  'other',
])

/**
 * Maps runtime game type values to the current Prisma GameType enum.
 *
 * `telephone_doodle` is intentionally persisted as `other` until DB enum/schema
 * is expanded in a dedicated migration.
 */
export function toPersistedGameType(gameType: string): PrismaGameType {
  if (gameType === 'telephone_doodle') {
    return 'other'
  }

  if (PERSISTED_GAME_TYPES.has(gameType as PrismaGameType)) {
    return gameType as PrismaGameType
  }

  return 'other'
}
