import type { TranslationKeys } from '@/lib/i18n-helpers'

export interface ReplayPlayer {
  userId: string
  name: string
  isBot: boolean
  /** Seat index in engine order: Tic-Tac-Toe X, Connect Four disc 1 and Checkers side 1 are seat 0. */
  seat: number
}

/** One stored snapshot as the replay API returns it. */
export interface ReplaySnapshotInput {
  id: string
  turnNumber: number
  playerId: string | null
  actionType: string
  actionPayload: unknown
  state: unknown
  createdAt: string
}

export type ReplayStepKind = 'start' | 'move' | 'system'

export interface ReplayStep {
  index: number
  /** The action without its `bot:` prefix. */
  action: string
  actionType: string
  actorId: string | null
  isBot: boolean
  payload: unknown
  /** The board to draw for this step. */
  state: unknown
  prevState: unknown
  /** Where the step settles after a pause, e.g. a Memory mismatch turning back. */
  endState?: unknown
  snapshotIds: string[]
  kind: ReplayStepKind
  createdAt: string
}

export interface ReplayCaption {
  key: TranslationKeys
  params?: Record<string, string | number>
  /** Params that are themselves locale keys, translated before the caption is. */
  paramKeys?: Record<string, TranslationKeys>
}

export interface ReplayContext {
  seats: ReplayPlayer[]
  playerNameById: Map<string, string>
  viewerId: string | null
}

export interface ReplayRendererProps extends ReplayContext {
  step: ReplayStep
  isFinalStep: boolean
}
