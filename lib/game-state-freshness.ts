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
 * - The player's own move response is always trusted. It is the newest thing
 *   that exists by definition, and it is what unsticks the board if the
 *   watermark ever gets ahead.
 *
 * A snapshot with no `lastMoveAt` cannot be judged, so it is accepted; the
 * in-flight guard below is what protects that case.
 */

export interface FreshnessWatermark {
  /** The `lastMoveAt` of the newest server snapshot applied so far, or null before the first. */
  current: number | null
}

export function createFreshnessWatermark(): FreshnessWatermark {
  return { current: null }
}

export function readLastMoveAt(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as { lastMoveAt?: unknown }).lastMoveAt
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export interface FreshnessDecision {
  /** Whether the caller should apply this snapshot. */
  accept: boolean
  /** Why it was rejected, for the log line. */
  reason?: 'older-than-applied' | 'move-in-flight'
}

/**
 * `trusted` is the response to a move this client just submitted; it always wins.
 * `moveInFlight` is true between optimistic apply and that response — during
 * that window an unsolicited snapshot cannot have seen the move, so it is
 * dropped rather than compared.
 */
export function decideFreshness(
  watermark: FreshnessWatermark,
  incoming: unknown,
  options?: { trusted?: boolean; moveInFlight?: boolean }
): FreshnessDecision {
  const incomingLastMoveAt = readLastMoveAt(incoming)

  if (options?.trusted) {
    if (incomingLastMoveAt !== null) watermark.current = incomingLastMoveAt
    return { accept: true }
  }

  if (options?.moveInFlight) return { accept: false, reason: 'move-in-flight' }

  if (incomingLastMoveAt === null) return { accept: true }

  // Strictly newer: a rebroadcast of the state the board already shows carries
  // the same stamp and must not re-render over an optimistic move.
  if (watermark.current !== null && incomingLastMoveAt <= watermark.current) {
    return { accept: false, reason: 'older-than-applied' }
  }

  watermark.current = incomingLastMoveAt
  return { accept: true }
}

/** A rematch or a returned-to-waiting lobby starts a new series; the old watermark must not block it. */
export function resetFreshnessWatermark(watermark: FreshnessWatermark): void {
  watermark.current = null
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
