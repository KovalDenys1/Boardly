/**
 * The user id a game page hands GamePlayerCard, so that another player's avatar opens
 * their player card and its Report action (#1172). Null for an empty seat and for a
 * bot: a bot has no card (GET /api/users/<id>/card answers 404) and nothing of its
 * own to report, so its avatar stays a plain picture.
 *
 * Pages keep bots in two shapes (`player.user.bot` after the February 2026 migration,
 * `player.bot` before it), the same pair every game page already checks.
 */
export function reportablePlayerId(
  players: ReadonlyArray<{ userId?: string | null; bot?: unknown; user?: { bot?: unknown } | null }>,
  userId: string | null | undefined
): string | null {
  if (!userId) return null
  const player = players.find((entry) => entry.userId === userId)
  if (player && (player.user?.bot || player.bot)) return null
  return userId
}
