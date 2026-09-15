/**
 * Query-string helpers for `/lobby/create`.
 *
 * The Discord `/play <game> [players]` command links to
 * `/lobby/create?gameType=…&maxPlayers=…`, so the seat count arrives as untrusted URL
 * input: anyone can edit it, and a bad value must never break the page.
 */

/**
 * Resolves the `?maxPlayers=` parameter against the seat counts a game actually offers.
 *
 * Returns the requested count only when it is one of the values the game's own player
 * slider accepts – the allowed list is not always a contiguous range (Alias is
 * `[4, 6, 8, 10, 12, 16]`), so a plain min/max clamp would produce a count the form
 * cannot represent. Anything else – missing, not a whole number, negative, out of range,
 * or in range but unsupported – returns `null`, which the caller reads as "use the
 * game's default" rather than as an error.
 */
export function resolveRequestedMaxPlayers(
  requested: string | null | undefined,
  allowedPlayers: readonly number[] | undefined
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

  return parsed
}
