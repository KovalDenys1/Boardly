/**
 * Which authoritative snapshot is allowed to replace the one on screen (#985).
 *
 * A game page has three sources of state and they do not arrive in order: the
 * response to the player's own move, a realtime broadcast, and whatever an
 * already-in-flight lobby poll happens to carry. Nothing compared them, so a
 * snapshot taken *before* the player moved could land on top of the optimistic
 * board — the move vanished, then the real state arrived and it came back. That
 * is the flicker players reported.
 *
 * The comparable value is `lastMoveAt`, which every engine stamps when it
 * processes a move. Two rules keep the comparison honest:
 *
 * - Only *server* snapshots update the watermark. An optimistic state is
 *   stamped with the client's clock, and a client running a few seconds fast
 *   would otherwise reject every real state that followed and freeze the board.
 * - The player's own move response is trusted, and it is what unsticks the
 *   board if the watermark ever gets ahead – unless a snapshot newer than it
 *   landed while it was in flight.
 *
 * A snapshot with no `lastMoveAt` cannot be judged, so it is accepted; the
 * in-flight guard below is what protects that case.
 */

export interface FreshnessWatermark {
  /** The `lastMoveAt` of the newest server snapshot applied so far, or null before the first. */
  current: number | null
  /** The state's own `updatedAt` beside `current`; it breaks a tie on `lastMoveAt` when both sides carry it. */
  updatedAt?: number | null
  /** `current` came from a snapshot taken while a move was in flight, so that move's own answer may be older. */
  overtookMove?: boolean
  /** A snapshot newer than the board was dropped for a move in flight, so the page reads again once it settles. */
  missedDuringMove?: boolean
}

export function createFreshnessWatermark(): FreshnessWatermark {
  return { current: null }
}

export function readLastMoveAt(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as { lastMoveAt?: unknown }).lastMoveAt
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function readUpdatedAt(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as { updatedAt?: unknown }).updatedAt
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value
  return typeof time === 'number' && Number.isFinite(time) ? time : null
}

function ageAgainst(watermark: FreshnessWatermark, lastMoveAt: number, updatedAt: number | null): 'older' | 'same' | 'newer' {
  if (watermark.current === null) return 'newer'
  if (lastMoveAt !== watermark.current) return lastMoveAt < watermark.current ? 'older' : 'newer'
  const mark = watermark.updatedAt ?? null
  if (updatedAt === null || mark === null || updatedAt === mark) return 'same'
  return updatedAt < mark ? 'older' : 'newer'
}

export interface FreshnessDecision {
  /** Whether the caller should apply this snapshot. */
  accept: boolean
  /** Why it was rejected, for the log line. */
  reason?: 'older-than-applied' | 'move-in-flight'
}

/**
 * How far ahead of this client's clock an unsolicited snapshot's `lastMoveAt`
 * may be and still move the watermark (GHSA-g868-9224-wr3p).
 *
 * The watermark only ever goes up, so one snapshot stamped far in the future
 * would make every real one after it look "older" and be dropped until the
 * player's own next move. Broadcasts are signed by the server now, so such a
 * snapshot should not arrive at all; this keeps the damage bounded if one
 * ever does. A snapshot beyond the lead is still applied – a device whose
 * clock is minutes slow sees every genuine stamp as "future", and freezing its
 * board would be worse – it just does not raise the bar for the next one.
 */
export const MAX_WATERMARK_LEAD_MS = 60 * 1000

/**
 * `trusted` is the response to a move this client just submitted; it wins unless a snapshot newer than it landed during its flight.
 * `moveInFlight` is true between optimistic apply and that response — during
 * that window an unsolicited snapshot cannot have seen the move, so it is
 * dropped rather than compared.
 * `snapshot` is a lobby read: its equal stamp may carry an unstamped timeout or sweep, unless a move is in flight on that board.
 */
export function decideFreshness(
  watermark: FreshnessWatermark,
  incoming: unknown,
  options?: { trusted?: boolean; moveInFlight?: boolean; snapshot?: boolean; now?: number }
): FreshnessDecision {
  const incomingLastMoveAt = readLastMoveAt(incoming)
  const incomingUpdatedAt = readUpdatedAt(incoming)
  const age = incomingLastMoveAt === null ? null : ageAgainst(watermark, incomingLastMoveAt, incomingUpdatedAt)

  if (options?.trusted) {
    const overtaken = watermark.overtookMove === true && age === 'older'
    watermark.overtookMove = false
    if (overtaken) return { accept: false, reason: 'older-than-applied' }
    if (incomingLastMoveAt !== null) {
      watermark.current = incomingLastMoveAt
      watermark.updatedAt = incomingUpdatedAt
    }
    return { accept: true }
  }

  if (options?.moveInFlight && !options?.snapshot) {
    if (age !== 'older' && age !== 'same') watermark.missedDuringMove = true
    return { accept: false, reason: 'move-in-flight' }
  }

  if (incomingLastMoveAt === null) return { accept: true }

  if (age === 'older') return { accept: false, reason: 'older-than-applied' }
  if (age === 'same') {
    // Strictly newer: a rebroadcast of the state the board already shows carries
    // the same stamp and must not re-render over an optimistic move.
    if (!options?.snapshot) return { accept: false, reason: 'older-than-applied' }
    if (options?.moveInFlight) return { accept: false, reason: 'move-in-flight' }
    watermark.updatedAt = watermark.updatedAt ?? incomingUpdatedAt
    watermark.overtookMove = false
    return { accept: true }
  }

  const now = options?.now ?? Date.now()
  if (incomingLastMoveAt <= now + MAX_WATERMARK_LEAD_MS) {
    watermark.current = incomingLastMoveAt
    watermark.updatedAt = incomingUpdatedAt
    watermark.overtookMove = options?.moveInFlight === true
  }
  return { accept: true }
}

/** Whether a newer snapshot was dropped for the move that just settled; asking clears it. */
export function takeMissedSnapshot(watermark: FreshnessWatermark): boolean {
  const missed = watermark.missedDuringMove === true
  watermark.missedDuringMove = false
  return missed
}

/** A rematch or a returned-to-waiting lobby starts a new series; the old watermark must not block it. */
export function resetFreshnessWatermark(watermark: FreshnessWatermark): void {
  watermark.current = null
  watermark.updatedAt = null
  watermark.overtookMove = false
  watermark.missedDuringMove = false
}

/**
 * The game a snapshot belongs to, when it says so. A rematch is a new row with
 * a new id, and its state must neither be written into the game on screen nor
 * move that game's watermark (#994).
 */
export function readGameStateId(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as { id?: unknown }).id
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Whether a game-update broadcast belongs to a different game row than the one
 * on screen – a rematch – and must be dropped (#994).
 *
 * Judged only by the `gameId` the server puts on the broadcast, never by the
 * state's own `id`: engines are created with `game_${Date.now()}` in
 * POST /api/game/create, so that id never equals the row id. Comparing the two
 * dropped every broadcast for Memory, Yahtzee and Spy from 18.09 (#1160). An
 * untagged update is accepted, as it was before #994.
 */
export function isUpdateForAnotherGame(update: unknown, currentGameId: string): boolean {
  if (!update || typeof update !== 'object') return false
  const tagged = (update as { gameId?: unknown }).gameId
  return typeof tagged === 'string' && tagged.length > 0 && tagged !== currentGameId
}

const LIFECYCLE_ORDER = ['waiting', 'playing', 'finished'] as const
export type LifecycleStatus = (typeof LIFECYCLE_ORDER)[number]

/**
 * The game row's lifecycle status after seeing `incoming`, moving only forward
 * (waiting → playing → finished) (#1183).
 *
 * The watermark judges the board, not the lifecycle. When the start broadcast
 * was applied first, every later snapshot carrying `status: 'playing'` had the
 * same `lastMoveAt` and was rejected as stale, so a non-host sat on "Waiting
 * for host to start" until they reloaded. A forward step cannot rewind
 * anything, so it is safe to take even from a snapshot whose board is dropped.
 */
export function advanceLifecycleStatus<T extends string>(current: T, incoming: unknown): T | LifecycleStatus {
  const currentRank = LIFECYCLE_ORDER.indexOf(current as LifecycleStatus)
  const incomingRank = LIFECYCLE_ORDER.indexOf(incoming as LifecycleStatus)
  if (currentRank === -1 || incomingRank === -1 || incomingRank <= currentRank) return current
  return LIFECYCLE_ORDER[incomingRank]
}

/** Only a snapshot dropped as old as the board, for the move in flight, still brings its roster; the status stays the move's own. */
export function keepBoardFromDroppedSnapshot<G extends { id: string; status: string; players?: unknown }>(
  current: G | null,
  dropped: { id?: unknown; status?: unknown; players?: unknown } | null | undefined,
  decision: FreshnessDecision
): G | null {
  if (decision.reason !== 'move-in-flight' || !current || !dropped || dropped.id !== current.id) return current
  return dropped.players !== undefined ? { ...current, players: dropped.players } : current
}
