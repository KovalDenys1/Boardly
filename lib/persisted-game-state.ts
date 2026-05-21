import { z } from 'zod'
import type { Prisma } from '@/prisma/client'

export type PersistedGameStateValue = Prisma.JsonValue | string | null | undefined

const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number().optional(),
  isActive: z.boolean().optional(),
}).passthrough()

export const persistedGameStateSchema = z.object({
  id: z.string(),
  gameType: z.string(),
  players: z.array(playerSchema),
  currentPlayerIndex: z.number().int().min(0),
  status: z.enum(['waiting', 'playing', 'finished']),
  data: z.unknown(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  winner: z.string().optional(),
  lastMoveAt: z.number().optional(),
  config: z.object({
    maxPlayers: z.number(),
    minPlayers: z.number(),
    timeLimit: z.number().optional(),
    rules: z.record(z.unknown()).optional(),
  }).optional(),
})

export type ValidatedGameState = z.infer<typeof persistedGameStateSchema>

export function parsePersistedGameState<T = unknown>(value: PersistedGameStateValue): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }

  return JSON.parse(JSON.stringify(value ?? null)) as T
}

export function parseAndValidateGameState(value: PersistedGameStateValue): ValidatedGameState {
  const raw = parsePersistedGameState(value)
  return persistedGameStateSchema.parse(raw)
}

export function stringifyPersistedGameState(value: PersistedGameStateValue): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value ?? null)
}

export function toPersistedGameStateInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
}
