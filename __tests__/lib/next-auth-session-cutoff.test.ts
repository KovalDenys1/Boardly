/**
 * The session cutoff (#1136, audit S1-01; the fix #805 specified and PR #835
 * never shipped). Sessions are stateless JWTs, so a password reset used to
 * leave a session stolen before it working for up to 30 days. jwt.decode now
 * rejects a token whose authenticatedAt is earlier than Users.sessionsValidFrom,
 * on every request, including the OAuth callback that links a new provider
 * identity to the account a session cookie belongs to.
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
import path from 'path'
import { decode as defaultJwtDecode } from 'next-auth/jwt'
import { authOptions, isBeforeSessionCutoff } from '@/lib/next-auth'

const findUnique = prisma.users.findUnique as jest.Mock
const verifySignature = defaultJwtDecode as jest.Mock
// next-auth's exports map hides core/, so reach the handler by its file path.
const callbackHandler = jest.requireActual(
  path.join(path.dirname(require.resolve('next-auth')), 'core/lib/callback-handler.js')
).default
const jwt = authOptions.callbacks!.jwt!
const decode = authOptions.jwt!.decode!

// The cookie's signature checks out; what is left to decide is the cutoff.
async function decodeCookie(payload: Record<string, unknown>) {
  verifySignature.mockResolvedValue(payload)
  return decode({ token: 'session-cookie', secret: 'test-secret' })
}

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

describe('jwt.decode session cutoff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findUnique.mockReset()
  })

  it('keeps a session when the account has no cutoff (every row after the migration)', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: null })

    const payload = await decodeCookie(liveToken())

    expect(payload?.id).toBe('user-1')
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { sessionsValidFrom: true },
    })
  })

  it('rejects the pre-reset session on its next request after a password reset', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT + 5 * 60_000) })

    await expect(decodeCookie(liveToken())).resolves.toBeNull()
  })

  it('keeps a session that signed in after the reset', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT - 60_000) })

    const payload = await decodeCookie(liveToken())

    expect(payload?.id).toBe('user-1')
  })

  it('checks on every request, not only when the 30-minute refresh is due', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: null })
    await expect(decodeCookie(liveToken())).resolves.not.toBeNull()

    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT + 1) })
    await expect(decodeCookie(liveToken())).resolves.toBeNull()
  })

  it('reads the account from sub when the token carries no id', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT + 1) })

    await expect(decodeCookie(liveToken({ id: undefined, sub: 'user-1' }))).resolves.toBeNull()
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { sessionsValidFrom: true },
    })
  })

  it('rejects a session whose account has been deleted', async () => {
    findUnique.mockResolvedValue(null)

    await expect(decodeCookie(liveToken())).resolves.toBeNull()
  })

  it('does not sign anyone out when the cutoff read itself fails', async () => {
    findUnique.mockRejectedValue(new Error('connection reset'))

    const payload = await decodeCookie(liveToken())

    expect(payload?.id).toBe('user-1')
  })

  it('does not read the database for a cookie whose signature fails', async () => {
    verifySignature.mockResolvedValue(null)

    await expect(decode({ token: 'forged', secret: 'test-secret' })).resolves.toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('stamps authenticatedAt on the sign-in call itself', async () => {
    findUnique.mockResolvedValue({ avatarUrl: null, username: 'Player', role: 'user', suspended: false })

    const token = await jwt({
      token: {},
      user: { id: 'user-1', email: 'player@example.com', username: 'Player' },
    })

    expect(typeof token.authenticatedAt).toBe('number')
  })
})

// The review finding behind moving the check into decode: next-auth's OAuth
// callback decodes the existing session cookie to pick the account a new
// provider identity is linked to, and never runs callbacks.jwt on it. This
// drives next-auth's own callback handler with our decode.
describe('OAuth callback with an existing session cookie', () => {
  const VICTIM = { id: 'user-1', email: 'player@example.com' }
  const ATTACKER_ACCOUNT = {
    provider: 'google',
    type: 'oauth',
    providerAccountId: 'google-attacker',
  }

  function oauthCallback() {
    const adapter = {
      getUser: jest.fn(async (id: string) => (id === VICTIM.id ? VICTIM : null)),
      getUserByAccount: jest.fn(async () => null),
      getUserByEmail: jest.fn(async () => null),
      createUser: jest.fn(async (data: Record<string, unknown>) => ({ ...data, id: 'user-new' })),
      linkAccount: jest.fn(async () => undefined),
    }
    const run = callbackHandler({
      sessionToken: 'stolen-session-cookie',
      profile: { id: 'google-attacker', email: 'attacker@example.com', name: 'Attacker' },
      account: ATTACKER_ACCOUNT,
      options: {
        adapter,
        jwt: { ...authOptions.jwt, secret: 'test-secret' },
        events: {},
        session: { strategy: 'jwt', maxAge: 60, generateSessionToken: jest.fn() },
        provider: { id: 'google' },
      },
    })
    return { adapter, run }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    findUnique.mockReset()
    verifySignature.mockResolvedValue({ ...liveToken(), sub: VICTIM.id })
  })

  it('does not link a new provider account to the victim through a pre-reset cookie', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: new Date(SIGNED_IN_AT + 5 * 60_000) })

    const { adapter, run } = oauthCallback()
    const result = await run

    expect(adapter.getUser).not.toHaveBeenCalled()
    expect(adapter.linkAccount).not.toHaveBeenCalledWith(expect.objectContaining({ userId: VICTIM.id }))
    // No token for the victim: the identity lands on an account of its own.
    expect(result.user.id).not.toBe(VICTIM.id)
  })

  it('still links to the signed-in account when the cookie is current', async () => {
    findUnique.mockResolvedValue({ sessionsValidFrom: null })

    const { adapter, run } = oauthCallback()
    const result = await run

    expect(adapter.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ userId: VICTIM.id }))
    expect(result.user.id).toBe(VICTIM.id)
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
