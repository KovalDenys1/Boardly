/**
 * Yahtzee motion decisions (#1114), kept pure so they can be tested without
 * the lobby page.
 */

export interface LastRollLike {
  playerId: string
  rollNumber: number
  timestamp: number
}

/** Changes exactly when a roll lands: who rolled, which roll of the turn, when. */
export function rollSignature(lastRoll: LastRollLike | null | undefined): string | null {
  if (!lastRoll || !lastRoll.playerId) return null
  return `${lastRoll.playerId}:${lastRoll.rollNumber}:${lastRoll.timestamp}`
}

/**
 * Whether a roll by someone else just arrived. `previousSignature` is
 * `undefined` until the first snapshot has been seen, and a snapshot loading
 * in is not a roll. The viewer's own roll animates from the local roll action.
 */
export function isRemoteRollArrival(
  previousSignature: string | null | undefined,
  lastRoll: LastRollLike | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  const signature = rollSignature(lastRoll)
  if (previousSignature === undefined || !signature || signature === previousSignature) return false
  return lastRoll!.playerId !== viewerId
}

/**
 * Whose scorecard to show. An explicit pick wins; otherwise the card of the
 * player who just finished their turn lingers for a moment (so their scored
 * row's flash is seen) before the view follows the turn.
 */
export function resolveScorecardPlayerId(
  selectedPlayerId: string | null,
  lingerPlayerId: string | null,
  currentPlayerId: string | null | undefined,
): string | null {
  return selectedPlayerId || lingerPlayerId || currentPlayerId || null
}
