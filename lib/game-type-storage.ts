import { GameType as PrismaGameTypeEnum, type GameType as PrismaGameType } from '@/prisma/client'

const VALID_GAME_TYPES = new Set<string>(Object.values(PrismaGameTypeEnum))

export function toPersistedGameType(gameType: string): PrismaGameType {
  return VALID_GAME_TYPES.has(gameType) ? (gameType as PrismaGameType) : 'other'
}
