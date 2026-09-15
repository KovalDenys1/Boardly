/**
 * Query-string helpers for `/lobby/create`.
 *
 * The Discord `/play <game> [players]` command links to
 * `/lobby/create?gameType=…&maxPlayers=…`, so the seat count arrives as untrusted URL
 * input: anyone can edit it, and a bad value must never break the page.
 */

/**
 * Mirrors the `FREE_MAX_PLAYERS` constant in `app/api/lobby/route.ts`, which answers 403
 * above it for an account without Premium. That route stays the authority – this copy only
 * keeps the form from opening at a seat count the account cannot submit. The route's
 * constant is module-private, so the test asserts the two still agree.
 */
export const FREE_MAX_PLAYERS = 10

/**
 * Resolves the `?maxPlayers=` parameter against the seat counts a game actually offers.
 *
 * The requested count is honoured only when it is one of the values the game's own player
 * slider accepts – the allowed list is not always a contiguous range (Alias is
 * `[4, 6, 8, 10, 12, 16]`), so a plain min/max clamp would produce a count the form cannot
 * represent. Anything else – missing, not a whole number, negative, out of range, or in
 * range but unsupported – returns `null`, which the caller reads as "use the game's
 * default" rather than as an error.
 *
 * Above `FREE_MAX_PLAYERS` an account without Premium gets the largest seat count it may
 * still create, so the deep link opens at a size the create request will accept instead of
 * at one that 403s on submit.
 */
export function resolveRequestedMaxPlayers(
  requested: string | null | undefined,
  allowedPlayers: readonly number[] | undefined,
  isPremium: boolean
): number | null {
  if (typeof requested !== 'string' || !allowedPlayers || allowedPlayers.length === 0) {
    return null
  }

  const trimmed = requested.trim()
  // Digits only: rejects '', '8.5', '8e0', '+8', '-2', '0x8' and 'eight' before Number()
  // turns any of them into something plausible.
  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || !allowedPlayers.includes(parsed)) {
    return null
  }

  if (isPremium || parsed <= FREE_MAX_PLAYERS) {
    return parsed
  }

  // Not sorted by contract, so take the maximum rather than the last element.
  const withinFreePlan = allowedPlayers.filter((n) => n <= FREE_MAX_PLAYERS)
  return withinFreePlan.length > 0 ? Math.max(...withinFreePlan) : null
}
