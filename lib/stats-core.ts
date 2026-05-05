// Canonical stats primitives shared by stats-calculator.ts, user-stats-dashboard.ts,
// and leaderboard/route.ts. Any change to outcome logic or win-rate formula must be
// reflected in the SQL CASE expressions in those files as well.

export type GameOutcome = 'win' | 'loss' | 'draw'

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Win rate = wins / (wins + losses). Draws are excluded from the denominator —
 * they don't count as decisive results.
 */
export function computeWinRate(wins: number, losses: number): number {
  const decisive = wins + losses
  return decisive > 0 ? roundToOneDecimal((wins / decisive) * 100) : 0
}

/**
 * Derive a player's outcome from DB fields.
 * Mirrors the SQL CASE in user-stats-dashboard.ts buildUserGamesCte:
 *
 *   CASE
 *     WHEN g.status <> 'finished'                          THEN NULL
 *     WHEN winnerCount = 0                                 THEN 'draw'
 *     WHEN p.isWinner = true AND winnerCount > 1           THEN 'draw'
 *     WHEN p.isWinner = true                               THEN 'win'
 *     ELSE                                                      'loss'
 *   END
 */
export function resolveOutcome(
  status: string,
  isWinner: boolean,
  winnerCount: number
): GameOutcome | null {
  if (status !== 'finished') return null
  if (winnerCount === 0) return 'draw'
  if (isWinner && winnerCount > 1) return 'draw'
  if (isWinner) return 'win'
  return 'loss'
}
