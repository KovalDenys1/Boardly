import type { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'

/**
 * Compare-and-set on Games, shared by every writer of `state` outside the main
 * move route (#993, #1001).
 *
 * The move route has always guarded its write with
 * `updateMany({ where: { id, currentTurn, updatedAt } })`, so a move that lost a
 * race is told it lost and can retry. Writers that used
 * `update({ where: { id } })` took part in none of that: their write landed
 * whatever had happened to the row since they read it, which silently erased the
 * other writer's move and left no trace that anything had been lost.
 */

export class GameStateConflictError extends Error {
  constructor() {
    super('Game row changed since it was read')
    this.name = 'GameStateConflictError'
  }
}

/** The row revision a guarded write is conditioned on. */
export interface GameRowRevision {
  currentTurn: number
  updatedAt: Date
}

/**
 * Everything a locked write may change. `currentTurn` and `updatedAt` are the
 * lock itself, so callers never set them: `updatedAt` is stamped here and
 * returned as the revision the row now carries.
 */
export type LockedGameStateUpdate = Omit<
  Prisma.GamesUncheckedUpdateManyInput,
  'id' | 'lobbyId' | 'currentTurn' | 'updatedAt' | 'createdAt'
>

/**
 * Writes the row only while it still carries `revision`. Returns the revision it
 * carries afterwards — feed that back in for a second write in the same request
 * — or null when somebody else committed first and nothing was written.
 */
export async function commitGameState(params: {
  gameId: string
  revision: GameRowRevision
  data: LockedGameStateUpdate
}): Promise<GameRowRevision | null> {
  const { gameId, revision, data } = params
  const updatedAt = new Date()

  const result = await prisma.games.updateMany({
    where: {
      id: gameId,
      currentTurn: revision.currentTurn,
      updatedAt: revision.updatedAt,
    },
    data: {
      ...data,
      updatedAt,
    },
  })

  if (result.count === 0) {
    return null
  }

  return { currentTurn: revision.currentTurn, updatedAt }
}
