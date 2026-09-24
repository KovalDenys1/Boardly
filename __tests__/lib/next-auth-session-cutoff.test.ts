/**
 * The session cutoff (#1136, audit S1-01; the fix #805 specified and PR #835
 * never shipped). Sessions are stateless JWTs, so a password reset used to
 * leave a session stolen before it working for up to 30 days. The jwt
 * callback now rejects a token whose authenticatedAt is earlier than
 * Users.sessionsValidFrom, on every request.
 */
// @ts-nocheck

jest.mock('next-auth/jwt', () => ({
  encode: jest.fn(),
  decode: jest.fn(),
}))
jest.mock('next-auth/providers/google', () => jest.fn(() => ({ id: 'google' })))
jest.mock('next-auth/providers/github', () => jest.fn(() => ({ id: 'github' })))
jest.mock('next-auth/providers/discord', () => jest.fn(() => ({ id: 'discord' })))
jest.mock('next-auth/providers/credentials', () => jest.fn((options) => ({ id: 'credentials', ...options })))
jest.mock('@/lib/custom-prisma-adapter', () => ({ CustomPrismaAdapter: jest.fn(() => ({})) }))
jest.mock('@/lib/auth', () => ({ comparePassword: jest.fn() }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))
jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    accounts: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { authOptions, isBeforeSessionCutoff, SessionRevokedError } from '@/lib/next-auth'

const findUnique = prisma.users.findUnique as jest.Mock
const jwt = authOptions.callbacks!.jwt!

const SIGNED_IN_AT = Date.parse('2026-09-20T10:00:00.000Z')

// A token that has just had its 30-minute refresh and lastActiveAt write, so
// the only database read left in the callback is the cutoff.
function liveToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'player@example.com',
    authenticatedAt: SIGNED_IN_AT,
    rememberMe: true,
    avatarResolved: Date.now(),
    lastActiveUpdate: Date.now(),
    ...overrides,
  }
}

describe('isBeforeSessionCutoff', () => {
  it('never revokes when the account has no cutoff', () => {
    expect(isBeforeSessionCutoff(SIGNED_IN_AT, null)).toBe(false)
    expect(isBeforeSessionCutoff(undefined, undefined)).toBe(false)
  })

  it('revokes a session that signed in before the cutoff, and only that', () => {
    const cutoff = new Date(SIGNED_IN_AT + 1)
    expect(isBeforeSessionCutoff(SIGNED_IN_AT, cutoff)).toBe(true)
    expect(isBeforeSessionCutoff(SIGNED_IN_AT + 1, cutoff)).toBe(false)
    expect(isBeforeSessionCutoff(SIGNED_IN_AT + 60_000, cutoff)).toBe(false)
  })

  it('treats a token without authenticatedAt as signed in at 0', () => {
    expect(isBeforeSessionCutoff(undefined, new Date(SIGNED_IN_AT))).toBe(true)
    expect(isBeforeSessionCutoff('yesterday', new Date(SIGNED_IN_AT))).toBe(true)
  })
})

describe('jwt callback session cutoff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findUnique.mockReset()
  })

  it('keeps a session when the account has no cutoff (every row after the migration)', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: null })

    const token = await jwt({ token: liveToken() })

    expect(token.id).toBe('user-1')
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { sessionsValidFrom: true },
    })
  })

  it('rejects the pre-reset session on its next request after a password reset', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT + 5 * 60_000) })

    await expect(jwt({ token: liveToken() })).rejects.toBeInstanceOf(SessionRevokedError)
  })

  it('keeps a session that signed in after the reset', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT - 60_000) })

    const token = await jwt({ token: liveToken() })

    expect(token.id).toBe('user-1')
  })

  it('checks on every request, not only when the 30-minute refresh is due', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: null })
    await jwt({ token: liveToken() })

    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT + 1) })
    await expect(jwt({ token: liveToken() })).rejects.toBeInstanceOf(SessionRevokedError)
  })

  it('rejects a session whose account has been deleted', async () => {
    findUnique.mockResolvedValue(null)

    await expect(jwt({ token: liveToken() })).rejects.toBeInstanceOf(SessionRevokedError)
  })

  it('does not sign anyone out when the cutoff read itself fails', async () => {
    findUnique.mockRejectedValue(new Error('connection reset'))

    const token = await jwt({ token: liveToken() })

    expect(token.id).toBe('user-1')
  })

  it('does not read the cutoff on the sign-in call itself', async () => {
    findUnique.mockResolvedValue({ avatarUrl: null, username: 'Player', role: 'user', suspended: false })

    const token = await jwt({
      token: {},
      user: { id: 'user-1', email: 'player@example.com', username: 'Player' },
    })

    expect(typeof token.authenticatedAt).toBe('number')
    expect(findUnique).not.toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { sessionsValidFrom: true },
    })
  })
})

describe('session callback', () => {
  it('exposes when the session signed in, for the email-change recent sign-in check', async () => {
    const session = await authOptions.callbacks!.session!({
      session: { user: {}, expires: '' },
      token: liveToken(),
    })

    expect(session.user.authenticatedAt).toBe(SIGNED_IN_AT)
  })
})
