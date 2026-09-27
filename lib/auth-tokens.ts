import { createHash, randomBytes } from 'crypto'
import { nanoid } from 'nanoid'
import type { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'

/**
 * Password reset, account deletion and email verification tokens (#1141).
 *
 * The emailed link carries the raw token; the database keeps only sha256(token) in
 * `tokenHash`, so reading the table (a leaked backup, an over-broad grant, a support
 * query) no longer hands over a link that resets a password or deletes an account.
 *
 * Why a plain SHA-256 and not bcrypt or scrypt: those exist to make guessing a
 * low-entropy secret such as a password expensive. These tokens are 32 random bytes
 * (256 bits) or nanoid(32) (about 190 bits), so there is nothing to guess at any hash
 * speed, and a salt would only stop the lookup from being an indexed equality match.
 * A hash that is one-way is all the table needs.
 *
 * Rows issued before this change still hold the raw value in `token` with a null
 * `tokenHash`, and a deletion row among them is marked only by a `DELETE_` prefix on
 * that value. The lookups below accept those rows until they expire (1 h for reset
 * and deletion, at most 48 h for verification), so no link already in someone's inbox
 * stops working. Once `select count(*) ... where "tokenHash" is null` is 0 on
 * production, the legacy branches and the `token` column can go.
 */

export type PasswordResetTokenPurpose = 'reset' | 'delete'

/** How a deletion token was told apart before `purpose` existed. Legacy rows only. */
export const LEGACY_DELETE_PREFIX = 'DELETE_'

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export interface IssuedAuthToken {
  /** Goes into the emailed link and nowhere else. */
  token: string
  /** Goes into the database. */
  tokenHash: string
}

/** 32 random bytes as hex: the reset and deletion token format. */
export function issueRandomHexToken(): IssuedAuthToken {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashAuthToken(token) }
}

/** nanoid(32): the email verification token format. */
export function issueVerificationToken(): IssuedAuthToken {
  const token = nanoid(32)
  return { token, tokenHash: hashAuthToken(token) }
}

type TokenClient = Pick<typeof prisma, 'passwordResetTokens' | 'emailVerificationTokens'>

function isLegacyDeleteValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(LEGACY_DELETE_PREFIX)
}

/**
 * The PasswordResetTokens row for `token`, only if it was issued for `purpose`. A
 * deletion token posted to the reset route, or the other way round, finds nothing.
 * Expiry is left to the caller, which answers an expired link differently.
 */
export async function findPasswordResetToken(
  token: string,
  purpose: PasswordResetTokenPurpose,
  db: TokenClient = prisma
) {
  const hashed = await db.passwordResetTokens.findUnique({
    where: { tokenHash: hashAuthToken(token) },
  })
  if (hashed) {
    return hashed.purpose === purpose ? hashed : null
  }

  // Legacy rows: the raw value is the lookup key, and only the prefix says what the
  // row is for. `tokenHash: null` is checked so the value of a hashed row's
  // `tokenHash`, read from the database and posted back, can never match here.
  if (purpose === 'delete') {
    const legacy = await db.passwordResetTokens.findUnique({
      where: { token: `${LEGACY_DELETE_PREFIX}${token}` },
    })
    return legacy && legacy.tokenHash === null ? legacy : null
  }

  if (isLegacyDeleteValue(token)) {
    return null
  }
  const legacy = await db.passwordResetTokens.findUnique({ where: { token } })
  return legacy && legacy.tokenHash === null && !isLegacyDeleteValue(legacy.token) ? legacy : null
}

/**
 * Where-clause for one user's tokens of one purpose, legacy rows included, so that
 * asking for a new reset link no longer cancels a pending deletion and the reverse.
 * `token: null` is spelled out because SQL's NOT over a NULL column is not true, and
 * every hashed row has a null `token`.
 */
export function passwordResetTokensOf(
  userId: string,
  purpose: PasswordResetTokenPurpose
): Prisma.PasswordResetTokensWhereInput {
  const legacyDelete = { token: { startsWith: LEGACY_DELETE_PREFIX } }
  if (purpose === 'delete') {
    return { userId, OR: [{ purpose: 'delete' }, legacyDelete] }
  }
  return { userId, purpose: 'reset', OR: [{ token: null }, { NOT: legacyDelete }] }
}

/** The EmailVerificationTokens row for `token`; expiry is left to the caller. */
export async function findEmailVerificationToken(token: string, db: TokenClient = prisma) {
  const hashed = await db.emailVerificationTokens.findUnique({
    where: { tokenHash: hashAuthToken(token) },
  })
  if (hashed) {
    return hashed
  }
  const legacy = await db.emailVerificationTokens.findUnique({ where: { token } })
  return legacy && legacy.tokenHash === null ? legacy : null
}
