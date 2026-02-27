import { Prisma } from '@prisma/client'
import { gzipSync, gunzipSync } from 'node:zlib'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('game-replay')
const DEFAULT_STATE_ENCODING = 'gzip-base64'
const MAX_SNAPSHOTS_PER_GAME = 500

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

function encodeState(state: unknown): {
  stateCompressed: string
  stateEncoding: string
  stateSize: number
} {
  const rawState = JSON.stringify(state ?? null)
  const compressed = gzipSync(Buffer.from(rawState, 'utf-8')).toString('base64')

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

export async function appendGameReplaySnapshot(input: ReplaySnapshotWriteInput): Promise<void> {
  if (!input.gameId || !input.actionType) return

  try {
    const encodedState = encodeState(input.state)
    const safeActionPayload = toReplayActionPayload(input.actionPayload)

    await prisma.$transaction(async (tx) => {
      const latestSnapshot = await tx.gameStateSnapshots.findFirst({
        where: { gameId: input.gameId },
        orderBy: [{ turnNumber: 'desc' }, { createdAt: 'desc' }],
        select: { turnNumber: true },
      })

      const nextTurnNumber = resolveTurnNumber(
        input.turnNumber,
        (latestSnapshot?.turnNumber ?? -1) + 1
      )

      await tx.gameStateSnapshots.create({
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

      const overflowSnapshots = await tx.gameStateSnapshots.findMany({
        where: { gameId: input.gameId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
        skip: MAX_SNAPSHOTS_PER_GAME,
      })

      if (overflowSnapshots.length > 0) {
        await tx.gameStateSnapshots.deleteMany({
          where: {
            id: {
              in: overflowSnapshots.map((snapshot) => snapshot.id),
            },
          },
        })
      }
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
