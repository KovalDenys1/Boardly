/**
 * @jest-environment node
 */
/**
 * #1223: an OAuth sign-in completed while already signed in must not link the provider
 * account to the signed-in user. next-auth 4.24 links an unlinked provider account to
 * whoever the session cookie names (core/lib/callback-handler.js), so the refusal lives in
 * callbacks.signIn, which runs before that.
 *
 * These tests drive the real catch-all route, next-auth's real callback route and the real
 * jwt encode/decode. Only the provider's code exchange is replaced (it would call Google),
 * and the adapter and Prisma are in-memory tables, so "no new Accounts row" is read off
 * the table the adapter writes to.
 */
// @ts-nocheck

import { NextRequest } from 'next/server'

type AccountRow = { id: string; userId: string; type: string; provider: string; providerAccountId: string }
type UserRow = {
  id: string
  email: string | null
  emailVerified: Date | null
  username: string | null
  suspended: boolean
  sessionsValidFrom: Date | null
}

const mockAccounts: AccountRow[] = []
const mockUsers = new Map<string, UserRow>()
let mockRequestCookies: Array<{ name: string; value: string }> = []

const mockAdapter = {
  createUser: jest.fn(async (user) => {
    const row = {
      id: `user-${mockUsers.size + 1}`,
      email: user.email ?? null,
      emailVerified: null,
      username: 'newcomer',
      suspended: false,
      sessionsValidFrom: null,
    }
    mockUsers.set(row.id, row)
    return { ...row, name: row.username }
  }),
  getUser: jest.fn(async (id) => {
    const row = mockUsers.get(id)
    return row ? { ...row, name: row.username } : null
  }),
  getUserByEmail: jest.fn(async (email) => {
    const row = [...mockUsers.values()].find((user) => user.email === email)
    return row ? { ...row, name: row.username } : null
  }),
  getUserByAccount: jest.fn(async ({ provider, providerAccountId }) => {
    const account = mockAccounts.find(
      (row) => row.provider === provider && row.providerAccountId === providerAccountId
    )
    const row = account ? mockUsers.get(account.userId) : null
    return row ? { ...row, name: row.username } : null
  }),
  updateUser: jest.fn(async (user) => user),
  linkAccount: jest.fn(async (account) => {
    mockAccounts.push({
      id: `acc-${mockAccounts.length + 1}`,
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    })
  }),
  deleteUser: jest.fn(),
  unlinkAccount: jest.fn(),
  createSession: jest.fn(),
  getSessionAndUser: jest.fn(),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
}

jest.mock('@/lib/custom-prisma-adapter', () => ({
  CustomPrismaAdapter: jest.fn(() => mockAdapter),
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(async ({ where }) => mockUsers.get(where.id) ?? null),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    accounts: {
      findUnique: jest.fn(async ({ where }) => {
        const { provider, providerAccountId } = where.provider_providerAccountId
        const row = mockAccounts.find(
          (account) => account.provider === provider && account.providerAccountId === providerAccountId
        )
        return row ? { ...row, user: mockUsers.get(row.userId) } : null
      }),
      update: jest.fn(async () => ({})),
    },
  },
}))

// The App Router handler reads the request's cookies and headers from next/headers, and so
// does the refusal; both see this request.
jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    getAll: () => mockRequestCookies,
    get: (name: string) => mockRequestCookies.find((cookie) => cookie.name === name),
  })),
  headers: jest.fn(async () => new Headers({ host: 'localhost:3000' })),
}))

// The code exchange with the provider. next-auth's exports map hides core/, so it is
// replaced by its file path, which is the file core/routes/callback.js requires.
jest.mock('../../node_modules/next-auth/core/lib/oauth/callback', () => ({
  __esModule: true,
  default: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitPresets: { credentialsLogin: {} },
}))
jest.mock('@/lib/discord/account-link', () => ({
  DISCORD_LINK_CALLBACK_PATH: '/api/auth/callback/discord',
  handleDiscordLinkCallback: jest.fn(),
  isDiscordLinkState: () => false,
}))
jest.mock('@/lib/auth', () => ({ comparePassword: jest.fn() }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const SECRET = 'test-secret-for-1223-signed-in-oauth'
process.env.NEXTAUTH_SECRET = SECRET
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.GOOGLE_CLIENT_ID = 'google-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret'

// Required, not imported: the providers are read from the environment when the module
// loads, and imports would run before the assignments above.
const { GET } = require('@/app/api/auth/[...nextauth]/route')
const { encode } = require('next-auth/jwt')
const { sessionTokensFromCookies } = require('@/lib/next-auth')
const oAuthCallback = require('../../node_modules/next-auth/core/lib/oauth/callback').default as jest.Mock

const SESSION_COOKIE = 'next-auth.session-token'
const REFUSED_LOCATION = '/profile?oauthLinkRefused=google'

function seedUser(id: string, email: string) {
  mockUsers.set(id, {
    id,
    email,
    emailVerified: new Date('2026-01-01T00:00:00Z'),
    username: id,
    suspended: false,
    sessionsValidFrom: null,
  })
}

function seedAccount(userId: string, provider: string, providerAccountId: string) {
  mockAccounts.push({ id: `acc-${mockAccounts.length + 1}`, userId, type: 'oauth', provider, providerAccountId })
}

/** Google answers the callback for this Google account. */
function googleReturns(providerAccountId: string, email: string) {
  oAuthCallback.mockResolvedValue({
    profile: { id: providerAccountId, name: 'Someone', email, image: null, providerEmailVerified: true },
    account: {
      provider: 'google',
      type: 'oauth',
      providerAccountId,
      access_token: 'access-token',
      expires_at: 2_000_000_000,
      scope: 'openid email profile',
      token_type: 'bearer',
    },
    OAuthProfile: { sub: providerAccountId, email, email_verified: true },
    cookies: [],
  })
}

async function signedInAs(userId: string) {
  const token = await encode({
    token: { sub: userId, id: userId, authenticatedAt: Date.now() },
    secret: SECRET,
  })
  return [{ name: SESSION_COOKIE, value: token }]
}

async function completeGoogleCallback(cookies: Array<{ name: string; value: string }>) {
  mockRequestCookies = cookies
  const request = new NextRequest('http://localhost:3000/api/auth/callback/google?code=code&state=state', {
    headers: { cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; ') },
  })
  const response: Response = await GET(request, {
    params: Promise.resolve({ nextauth: ['callback', 'google'] }),
  })
  return {
    status: response.status,
    location: response.headers.get('location'),
    setsSession: (response.headers.get('set-cookie') ?? '').includes(`${SESSION_COOKIE}=`),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAccounts.length = 0
  mockUsers.clear()
  mockRequestCookies = []
  seedUser('user-1', 'owner@example.com')
  seedAccount('user-1', 'discord', 'discord-owner')
})

describe('OAuth sign-in while already signed in (#1223)', () => {
  it('does not link a provider account nobody has linked yet, and says why on the profile', async () => {
    googleReturns('google-stranger', 'stranger@example.com')

    const result = await completeGoogleCallback(await signedInAs('user-1'))

    expect(result.status).toBe(302)
    expect(result.location).toBe(REFUSED_LOCATION)
    expect(mockAccounts).toHaveLength(1)
    expect(mockAdapter.linkAccount).not.toHaveBeenCalled()
    expect(mockAdapter.createUser).not.toHaveBeenCalled()
    // The browser stays signed in as it arrived: no new session is issued.
    expect(result.setsSession).toBe(false)
  })

  it('refuses a provider account linked to someone else, without touching that account', async () => {
    seedUser('user-2', 'other@example.com')
    seedAccount('user-2', 'google', 'google-other')
    googleReturns('google-other', 'other@example.com')

    const result = await completeGoogleCallback(await signedInAs('user-1'))

    expect(result.location).toBe(REFUSED_LOCATION)
    expect(mockAccounts).toHaveLength(2)
    expect(mockAdapter.linkAccount).not.toHaveBeenCalled()
    const { prisma } = require('@/lib/db')
    expect(prisma.accounts.update).not.toHaveBeenCalled()
    expect(result.setsSession).toBe(false)
  })

  it('still signs the user in with a provider account that is already theirs', async () => {
    seedAccount('user-1', 'google', 'google-owner')
    googleReturns('google-owner', 'owner@example.com')

    const result = await completeGoogleCallback(await signedInAs('user-1'))

    expect(result.location).not.toBe(REFUSED_LOCATION)
    expect(result.setsSession).toBe(true)
    expect(mockAccounts).toHaveLength(2)
    expect(mockAdapter.linkAccount).not.toHaveBeenCalled()
  })

  it('treats a session cut off by a password reset as signed out, as next-auth does (#1136)', async () => {
    const cookies = await signedInAs('user-1')
    mockUsers.get('user-1').sessionsValidFrom = new Date(Date.now() + 60_000)
    googleReturns('google-newcomer', 'newcomer@example.com')

    const result = await completeGoogleCallback(cookies)

    // Not refused, and not linked to user-1 either: a separate account, as for anyone
    // signed out.
    expect(result.location).not.toBe(REFUSED_LOCATION)
    expect(mockAdapter.createUser).toHaveBeenCalledTimes(1)
    expect(mockAccounts.filter((row) => row.userId === 'user-1')).toHaveLength(1)
  })
})

describe('OAuth sign-in while signed out is unchanged', () => {
  it('signs in with a linked provider account', async () => {
    seedAccount('user-1', 'google', 'google-owner')
    googleReturns('google-owner', 'owner@example.com')

    const result = await completeGoogleCallback([])

    expect(result.status).toBe(302)
    expect(result.location).not.toBe(REFUSED_LOCATION)
    expect(result.setsSession).toBe(true)
    expect(mockAccounts).toHaveLength(2)
    expect(mockAdapter.linkAccount).not.toHaveBeenCalled()
  })

  it('creates the account and links the provider for a newcomer', async () => {
    googleReturns('google-newcomer', 'newcomer@example.com')

    const result = await completeGoogleCallback([])

    expect(result.location).not.toBe(REFUSED_LOCATION)
    expect(result.setsSession).toBe(true)
    expect(mockAdapter.createUser).toHaveBeenCalledTimes(1)
    expect(mockAdapter.linkAccount).toHaveBeenCalledTimes(1)
    expect(mockAccounts).toHaveLength(2)
    expect(mockAccounts[1]).toMatchObject({ provider: 'google', providerAccountId: 'google-newcomer' })
    expect(mockAccounts[1].userId).not.toBe('user-1')
  })
})

describe('sessionTokensFromCookies', () => {
  it('reassembles a chunked session cookie in chunk order, under either name', () => {
    expect(
      sessionTokensFromCookies([
        { name: 'next-auth.session-token.1', value: 'BBB' },
        { name: 'other', value: 'x' },
        { name: 'next-auth.session-token.0', value: 'AAA' },
        { name: '__Secure-next-auth.session-token', value: 'SECURE' },
      ])
    ).toEqual(['SECURE', 'AAABBB'])
  })

  it('finds nothing without a session cookie', () => {
    expect(sessionTokensFromCookies([{ name: 'next-auth.csrf-token', value: 'x' }])).toEqual([])
  })
})
