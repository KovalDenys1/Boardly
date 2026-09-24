import { Prisma } from '@/prisma/client'
import { promisify } from 'node:util'
import { gunzipSync, gzip } from 'node:zlib'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('game-replay')
const DEFAULT_STATE_ENCODING = 'gzip-base64'
export const MAX_SNAPSHOTS_PER_GAME = 500
const gzipAsync = promisify(gzip)

export interface ReplaySnapshotWriteInput {
  gameId: string
  turnNumber?: number
  playerId?: string | null
  actionType: string
  actionPayload?: unknown
  state: unknown
}

interface ReplaySnapshotRecord {
  id: string
  turnNumber: number
  playerId: string | null
  actionType: string
  actionPayload: Prisma.JsonValue | null
  stateCompressed: string
  stateEncoding: string
  createdAt: Date
}

export interface ReplaySnapshotResponseItem {
  id: string
  turnNumber: number
  playerId: string | null
  actionType: string
  actionPayload: Prisma.JsonValue | null
  state: unknown
  createdAt: string
}

function toReplayActionPayload(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  } catch {
    return undefined
  }
}

async function encodeState(state: unknown): Promise<{
  stateCompressed: string
  stateEncoding: string
  stateSize: number
}> {
  const rawState = JSON.stringify(state ?? null)
  const compressed = (await gzipAsync(Buffer.from(rawState, 'utf-8'))).toString('base64')

  return {
    stateCompressed: compressed,
    stateEncoding: DEFAULT_STATE_ENCODING,
    stateSize: Buffer.byteLength(rawState, 'utf-8'),
  }
}

function decodeState(stateCompressed: string, stateEncoding: string): unknown {
  if (stateEncoding !== DEFAULT_STATE_ENCODING) {
    return JSON.parse(stateCompressed)
  }

  const inflated = gunzipSync(Buffer.from(stateCompressed, 'base64')).toString('utf-8')
  return JSON.parse(inflated)
}

function resolveTurnNumber(inputTurnNumber: number | undefined, fallbackTurnNumber: number): number {
  if (typeof inputTurnNumber === 'number' && Number.isFinite(inputTurnNumber)) {
    return Math.max(0, Math.floor(inputTurnNumber))
  }
  return Math.max(0, fallbackTurnNumber)
}

/**
 * Appends one replay snapshot. When the caller already tracks an
 * authoritative turn counter (state/route.ts and bot-turn/route.ts both do —
 * it's the same value they just wrote to Games.currentTurn), pass it as
 * `turnNumber` to skip the extra findFirst lookup this used to run on every
 * single move. Callers without one (the per-game-type action routes) fall
 * back to querying the latest snapshot, same as before. The per-game
 * snapshot cap is enforced by `cleanupOversizedReplaySnapshots` in the daily
 * maintenance cron instead of inline here — <1% of games ever approach it,
 * so checking on every move wasn't worth the extra round trip.
 */
export async function appendGameReplaySnapshot(input: ReplaySnapshotWriteInput): Promise<void> {
  if (!input.gameId || !input.actionType) return

  try {
    const encodedState = await encodeState(input.state)
    const safeActionPayload = toReplayActionPayload(input.actionPayload)

    let nextTurnNumber: number
    if (typeof input.turnNumber === 'number' && Number.isFinite(input.turnNumber)) {
      nextTurnNumber = resolveTurnNumber(input.turnNumber, 0)
    } else {
      const latestSnapshot = await prisma.gameStateSnapshots.findFirst({
        where: { gameId: input.gameId },
        orderBy: [{ turnNumber: 'desc' }, { createdAt: 'desc' }],
        select: { turnNumber: true },
      })
      nextTurnNumber = (latestSnapshot?.turnNumber ?? -1) + 1
    }

    await prisma.gameStateSnapshots.create({
      data: {
        gameId: input.gameId,
        turnNumber: nextTurnNumber,
        playerId: input.playerId ?? null,
        actionType: input.actionType,
        actionPayload: safeActionPayload,
        stateCompressed: encodedState.stateCompressed,
        stateEncoding: encodedState.stateEncoding,
        stateSize: encodedState.stateSize,
      },
    })
  } catch (error) {
    log.warn('Failed to append replay snapshot', {
      gameId: input.gameId,
      actionType: input.actionType,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function decodeGameReplaySnapshots(
  snapshots: ReplaySnapshotRecord[]
): ReplaySnapshotResponseItem[] {
  return snapshots.map((snapshot) => {
    let state: unknown = null
    try {
      state = decodeState(snapshot.stateCompressed, snapshot.stateEncoding)
    } catch (error) {
      log.warn('Failed to decode replay snapshot state', {
        snapshotId: snapshot.id,
        gameId: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return {
      id: snapshot.id,
      turnNumber: snapshot.turnNumber,
      playerId: snapshot.playerId,
      actionType: snapshot.actionType,
      actionPayload: snapshot.actionPayload,
      state,
      createdAt: snapshot.createdAt.toISOString(),
    }
  })
}

// Shared with lib/account-erasure.ts, which rewrites stored snapshots in place
// when a player is erased and must write them back in exactly this encoding.
export { encodeState as encodeReplayState, decodeState as decodeReplayState }
