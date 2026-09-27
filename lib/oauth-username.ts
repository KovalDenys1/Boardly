import { randomInt } from 'crypto'

/**
 * The username a new OAuth account starts with (#1142).
 *
 * `events.linkAccount` used to overwrite it with the email's local part on every link,
 * which put part of the address on the leaderboard, clobbered a name the person had
 * chosen when they later linked another provider, and failed the sign-in on the unique
 * index whenever two addresses shared a local part. That write is gone, so the name set
 * here at `createUser` is the one that stays until the person changes it.
 *
 * It follows the rule every other writer enforces - 3 to 20 of `[A-Za-z0-9_]`, see
 * lib/validation/auth.ts - which a provider display name such as "John Doe" does not,
 * and it is checked case-insensitively against existing names so a second "John Doe"
 * gets a suffix instead of a unique-constraint failure at sign-up.
 */

const MIN_LENGTH = 3
const MAX_LENGTH = 20
const FALLBACK_BASE = 'player'

/** A provider display name cut down to the username alphabet, or null if nothing usable is left. */
export function oauthUsernameBase(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/_+$/, '')
  return cleaned.length >= MIN_LENGTH ? cleaned : null
}

export function withNumericSuffix(base: string, digits = 4): string {
  const suffix = String(randomInt(0, 10 ** digits)).padStart(digits, '0')
  return `${base.slice(0, MAX_LENGTH - digits - 1).replace(/_+$/, '')}_${suffix}`
}

/**
 * A free username for a new OAuth account named `name` by its provider: the cleaned
 * name if nobody holds it, else the name with a four-digit suffix. A name with nothing
 * usable in it (all non-Latin script, say) becomes `player_1234`, never the email.
 */
export async function pickOAuthUsername(
  name: string | null | undefined,
  isTaken: (candidate: string) => Promise<boolean>
): Promise<string> {
  const base = oauthUsernameBase(name)
  if (base && !(await isTaken(base))) {
    return base
  }
  const stem = base ?? FALLBACK_BASE
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withNumericSuffix(stem)
    if (!(await isTaken(candidate))) {
      return candidate
    }
  }
  // Five four-digit misses in a row: widen the suffix rather than fail the sign-up.
  return withNumericSuffix(stem, 8)
}
