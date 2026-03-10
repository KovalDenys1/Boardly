import type { Prisma } from '@prisma/client'

export type PersistedGameStateValue = Prisma.JsonValue | string | null | undefined

export function parsePersistedGameState<T = unknown>(value: PersistedGameStateValue): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }

  return JSON.parse(JSON.stringify(value ?? null)) as T
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
