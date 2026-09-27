/**
 * @jest-environment node
 */
/**
 * #1141: reset, deletion and verification tokens are stored as SHA-256 hashes, and a
 * reset token and a deletion token can no longer stand in for each other. Rows issued
 * before the change (raw value in `token`, deletion rows marked by a DELETE_ prefix)
 * keep working until they expire.
 */
import { createHash } from 'crypto'
import {
  findEmailVerificationToken,
  findPasswordResetToken,
  hashAuthToken,
  issueRandomHexToken,
  issueVerificationToken,
  passwordResetTokensOf,
} from '@/lib/auth-tokens'

jest.mock('@/lib/db', () => ({ prisma: {} }))

type Row = {
  id: string
  userId: string
  token: string | null
  tokenHash: string | null
  purpose?: 'reset' | 'delete'
  expires: Date
}

// An in-memory stand-in for the two tables' unique lookups.
function fakeDb(resetRows: Row[], verificationRows: Row[] = []) {
  const lookup = (rows: Row[]) =>
    jest.fn(async ({ where }: { where: { token?: string; tokenHash?: string } }) => {
      if (where.tokenHash !== undefined) return rows.find((r) => r.tokenHash === where.tokenHash) ?? null
      if (where.token !== undefined) return rows.find((r) => r.token === where.token) ?? null
      return null
    })
  return {
    passwordResetTokens: { findUnique: lookup(resetRows) },
    emailVerificationTokens: { findUnique: lookup(verificationRows) },
  } as never
}

const soon = () => new Date(Date.now() + 60_000)

describe('issuing', () => {
  it('hashes with plain SHA-256 hex', () => {
    expect(hashAuthToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
  })

  it('a reset or deletion token is 32 random bytes as hex, and the stored value is its hash', () => {
    const { token, tokenHash } = issueRandomHexToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash).toBe(hashAuthToken(token))
    expect(tokenHash).not.toBe(token)
    expect(issueRandomHexToken().token).not.toBe(token)
  })

  it('a verification token is a nanoid (mocked in jest) and the stored value is its hash', () => {
    const { token, tokenHash } = issueVerificationToken()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
    expect(tokenHash).toBe(hashAuthToken(token))
  })
})

describe('findPasswordResetToken', () => {
  const resetRaw = 'r'.repeat(64)
  const deleteRaw = 'd'.repeat(64)
  const rows: Row[] = [
    { id: 'reset-new', userId: 'u1', token: null, tokenHash: hashAuthToken(resetRaw), purpose: 'reset', expires: soon() },
    { id: 'delete-new', userId: 'u1', token: null, tokenHash: hashAuthToken(deleteRaw), purpose: 'delete', expires: soon() },
    { id: 'reset-legacy', userId: 'u2', token: 'legacyreset', tokenHash: null, purpose: 'reset', expires: soon() },
    // The migration leaves purpose at its default for old deletion rows; only the prefix marks them.
    { id: 'delete-legacy', userId: 'u3', token: 'DELETE_legacydelete', tokenHash: null, purpose: 'reset', expires: soon() },
  ]

  it('finds a new reset token for a reset and a new deletion token for a deletion', async () => {
    const db = fakeDb(rows)
    await expect(findPasswordResetToken(resetRaw, 'reset', db)).resolves.toMatchObject({ id: 'reset-new' })
    await expect(findPasswordResetToken(deleteRaw, 'delete', db)).resolves.toMatchObject({ id: 'delete-new' })
  })

  it('never lets one purpose stand in for the other', async () => {
    const db = fakeDb(rows)
    await expect(findPasswordResetToken(deleteRaw, 'reset', db)).resolves.toBeNull()
    await expect(findPasswordResetToken(resetRaw, 'delete', db)).resolves.toBeNull()
    await expect(findPasswordResetToken('DELETE_legacydelete', 'reset', db)).resolves.toBeNull()
    await expect(findPasswordResetToken('legacyreset', 'delete', db)).resolves.toBeNull()
  })

  it('keeps accepting tokens issued before the change, each for its own purpose', async () => {
    const db = fakeDb(rows)
    await expect(findPasswordResetToken('legacyreset', 'reset', db)).resolves.toMatchObject({ id: 'reset-legacy' })
    // The deletion email never carried the prefix; the route adds it for the lookup.
    await expect(findPasswordResetToken('legacydelete', 'delete', db)).resolves.toMatchObject({ id: 'delete-legacy' })
  })

  it('does not accept a stored hash as the token', async () => {
    const db = fakeDb(rows)
    await expect(findPasswordResetToken(hashAuthToken(resetRaw), 'reset', db)).resolves.toBeNull()
    await expect(findPasswordResetToken(hashAuthToken(deleteRaw), 'delete', db)).resolves.toBeNull()
  })
})

describe('passwordResetTokensOf', () => {
  it('scopes a reset rotation to reset rows, the hashed ones (token null) included', () => {
    expect(passwordResetTokensOf('u1', 'reset')).toEqual({
      userId: 'u1',
      purpose: 'reset',
      OR: [{ token: null }, { NOT: { token: { startsWith: 'DELETE_' } } }],
    })
  })

  it('scopes a deletion rotation to deletion rows, legacy prefixed ones included', () => {
    expect(passwordResetTokensOf('u1', 'delete')).toEqual({
      userId: 'u1',
      OR: [{ purpose: 'delete' }, { token: { startsWith: 'DELETE_' } }],
    })
  })
})

describe('findEmailVerificationToken', () => {
  const raw = 'v'.repeat(32)
  const rows: Row[] = [
    { id: 'verify-new', userId: 'u1', token: null, tokenHash: hashAuthToken(raw), expires: soon() },
    { id: 'verify-legacy', userId: 'u2', token: 'legacyverify', tokenHash: null, expires: soon() },
  ]

  it('finds a new token by its hash and an old one by its raw value', async () => {
    const db = fakeDb([], rows)
    await expect(findEmailVerificationToken(raw, db)).resolves.toMatchObject({ id: 'verify-new' })
    await expect(findEmailVerificationToken('legacyverify', db)).resolves.toMatchObject({ id: 'verify-legacy' })
  })

  it('does not accept a stored hash as the token', async () => {
    const db = fakeDb([], rows)
    await expect(findEmailVerificationToken(hashAuthToken(raw), db)).resolves.toBeNull()
  })
})
