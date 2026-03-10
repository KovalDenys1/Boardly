import type { GameType as PrismaGameType } from '@prisma/client'

const PERSISTED_GAME_TYPES = new Set<PrismaGameType>([
  'yahtzee',
  'tic_tac_toe',
  'rock_paper_scissors',
  'memory',
  'chess',
  'guess_the_spy',
  'telephone_doodle',
  'sketch_and_guess',
  'liars_party',
  'fake_artist',
  'uno',
  'other',
])

/**
 * Maps runtime game type values to the current Prisma GameType enum.
 */
export function toPersistedGameType(gameType: string): PrismaGameType {
  if (PERSISTED_GAME_TYPES.has(gameType as PrismaGameType)) {
    return gameType as PrismaGameType
  }

  return 'other'
}
