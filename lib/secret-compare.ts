/**
 * Compares two strings in time that depends on their length, not on where they differ.
 *
 * A plain `===` / `!==` returns at the first mismatching character, which lets an attacker
 * measure their way through a secret one byte at a time over enough requests. None of the
 * internal secrets this compares (`BOARDLY_INTERNAL_SECRET`, `CRON_SECRET`) are long enough
 * for that to be a realistic attack across a network edge, but the inconsistency — one
 * comparator here, `===`/`!==` everywhere else — was the actual audit finding (#1119,
 * S2-04/S2-07), so every internal-secret check goes through this one function.
 *
 * Runtime-neutral (no `node:crypto`): `proxy.ts` and edge API routes both import call sites
 * that use this, and `node:crypto`'s `timingSafeEqual` is not available on the edge runtime.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false

  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}
