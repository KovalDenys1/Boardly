/**
 * The end of the window in which NEXTAUTH_SECRET still stands in for the two dedicated
 * secrets it used to replace (#1142 item 3, #1149).
 *
 * `GUEST_JWT_SECRET` and `PARTICIPATION_HASH_SALT` both fell back to NEXTAUTH_SECRET, and
 * production ran on the fallback, so one secret did three jobs. Setting the dedicated ones
 * without a transition would have broken what was signed or hashed under the old one:
 *
 * - every guest token in circulation, including the 90-day identity token (#818) that is
 *   the only way a returning guest is recognised - every guest would come back a stranger;
 * - the participation hash (#816), whose unique (lobbyId, participantKey) index is what
 *   absorbs a rejoin, so anyone rejoining a lobby they joined before the switch would be
 *   counted twice.
 *
 * So until this date NEXTAUTH_SECRET is still accepted when reading, while everything new is
 * written with the dedicated secret (Denys, 2026-09-27: "code accepts the old secret for 90
 * days"). Ninety days because that is the identity token's lifetime
 * (`GUEST_IDENTITY_TTL_DAYS`) and guest-session re-signs both tokens on every visit: a guest
 * who comes back inside the window leaves with tokens on the new secret, and an old-secret
 * token issued on 2026-09-28, the first day the new secrets can be set after this ships, has
 * expired on its own by 2026-12-27. Set later than that, the few identity tokens issued in
 * between are cut off at the cutoff and those guests start over as new guests - the price of
 * a window that closes by itself rather than one somebody has to remember to close.
 *
 * A constant, not an environment variable, for exactly that reason. After the cutoff this
 * module, and the fallback reads in lib/guest-auth.ts and lib/lobby-participation.ts, can be
 * deleted.
 */
export const NEXTAUTH_SECRET_FALLBACK_CUTOFF = '2026-12-27'

const CUTOFF_MS = Date.parse(`${NEXTAUTH_SECRET_FALLBACK_CUTOFF}T00:00:00.000Z`)

export type DedicatedSecretName = 'GUEST_JWT_SECRET' | 'PARTICIPATION_HASH_SALT'

/**
 * NEXTAUTH_SECRET, while it may still be accepted in place of `name` for reading what was
 * written before `name` was set; otherwise null.
 *
 * Null when `name` is unset (NEXTAUTH_SECRET is then already the current secret, so there is
 * nothing older to accept), when both hold the same value, and from the cutoff on.
 */
export function legacyNextAuthSecret(name: DedicatedSecretName, now: number = Date.now()): string | null {
  if (now >= CUTOFF_MS) return null
  const dedicated = process.env[name]
  const legacy = process.env.NEXTAUTH_SECRET
  if (!dedicated || !legacy || legacy === dedicated) return null
  return legacy
}
