import { GameType as GameTypeEnum } from '@/prisma/generated/client/enums'
import type { GameType as PrismaGameType } from '@/prisma/generated/client/enums'

const VALID_GAME_TYPES = new Set<string>(Object.values(GameTypeEnum))

export function toPersistedGameType(gameType: string): PrismaGameType {
  return VALID_GAME_TYPES.has(gameType) ? (gameType as PrismaGameType) : 'other'
}
