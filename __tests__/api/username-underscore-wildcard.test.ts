/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

/**
 * #1055, first finding - a free username can be refused.
 *
 * Prisma's `equals` with `mode: 'insensitive'` compiles to `ILIKE <value>` and
 * passes the value through unescaped, so the LIKE metacharacters in it stay
 * live. A username is `[a-zA-Z0-9_]+`, which means `_` is an ordinary character
 * in a name and a wildcard in the filter: asking about `new_user` also finds the
 * account `newXuser`.
 *
 * The mocked client here answers those filters the way Postgres does rather than
 * returning a canned array, because that is the whole of the bug - a route that
 * builds the right filter gets the right rows, and one that builds an ILIKE gets
 * a stranger's row as well. The semantics below were checked against boardly-dev
 * on 2026-09-21 with two real rows, `probe_1055_zz` and `probeX1055Xzz`:
 * `equals: 'probe_1055_zz', mode: 'insensitive'` returned both of them, and
 * escaping the underscores returned only the first.
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { GET as checkUsername } from '@/app/api/user/check-username/route'
import { PATCH as patchProfile } from '@/app/api/user/profile/route'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    players: { count: jest.fn() },
    userAchievements: { findMany: jest.fn() },
    emailVerificationTokens: { create: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
  rateLimitPresets: { api: {}, auth: {} },
}))

jest.mock('@/lib/public-profile.server', () => ({
  ensureUserHasPublicProfileId: jest.fn(async () => 'generated-public-id'),
}))

jest.mock('@/lib/email', () => ({
  sendVerificationEmail: jest.fn(async () => ({ success: true })),
}))

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'token') }))

jest.mock('@/lib/error-handler', () => {
  class AuthenticationError extends Error {
    statusCode = 401
  }
  class ConflictError extends Error {
    statusCode = 409
  }
  class ValidationError extends Error {
    statusCode = 400
  }

  return {
    AuthenticationError,
    ConflictError,
    ValidationError,
    withErrorHandler:
      (handler: (request: NextRequest) => Promise<Response>) => async (request: NextRequest) => {
        try {
          return await handler(request)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: (error as any)?.statusCode || 500 }
          )
        }
      },
  }
})

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

// Production shapes: Users.id is a cuid (@default(cuid()) in prisma/schema.prisma).
const ACCOUNT_ID = 'cmf9x2k7t0000l908h3j2b5qk'
const CALLER_ID = 'cmf9x2k7t0001l908abcd1234'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

/**
 * Postgres `ILIKE`, as the database applies it: `_` matches one character, `%`
 * matches any run, a backslash escapes the next character, and the comparison
 * ignores case. Written out rather than imported from anywhere in `lib/` so the
 * expectations below cannot be satisfied by the same helper the routes use.
 */
function ilike(value: unknown, pattern: string): boolean {
  if (typeof value !== 'string') return false

  let source = '^'
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index]

    if (character === '\\') {
      const escaped = pattern[index + 1]
      index++
      source += escaped === undefined ? '\\\\' : escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      continue
    }

    if (character === '_') {
      source += '.'
      continue
    }

    if (character === '%') {
      source += '.*'
      continue
    }

    source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  return new RegExp(`${source}$`, 'i').test(value)
}

function matchesStringFilter(value: unknown, filter: unknown): boolean {
  if (filter === null || typeof filter !== 'object') {
    return value === filter
  }

  const { equals, startsWith, mode } = filter as {
    equals?: string
    startsWith?: string
    mode?: string
  }

  if (typeof equals === 'string') {
    return mode === 'insensitive' ? ilike(value, equals) : value === equals
  }

  if (typeof startsWith === 'string') {
    return mode === 'insensitive'
      ? ilike(value, `${startsWith}%`)
      : typeof value === 'string' && value.startsWith(startsWith)
  }

  return false
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where ?? {}).every(([key, condition]) => {
    if (key === 'NOT') {
      return !matchesWhere(row, condition as Record<string, unknown>)
    }

    if (key === 'OR') {
      return (condition as Record<string, unknown>[]).some((clause) => matchesWhere(row, clause))
    }

    if (typeof condition === 'boolean' || condition === null || typeof condition === 'string') {
      return row[key] === condition
    }

    return matchesStringFilter(row[key], condition)
  })
}

/** The rows the fake database holds for one test. */
let rows: Record<string, unknown>[] = []

function installFakeDatabase() {
  mockPrisma.users.findMany.mockImplementation(async ({ where }: any) =>
    rows.filter((row) => matchesWhere(row, where))
  )
  mockPrisma.users.findFirst.mockImplementation(
    async ({ where }: any) => rows.find((row) => matchesWhere(row, where)) ?? null
  )
}

const account = (overrides: Record<string, unknown> = {}) => ({
  id: ACCOUNT_ID,
  username: 'newXuser',
  email: 'someone@example.com',
  pendingEmail: null,
  isGuest: false,
  ...overrides,
})

describe('GET /api/user/check-username', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    rows = []
    installFakeDatabase()
  })

  function check(username: string) {
    return checkUsername(
      new NextRequest(`http://localhost:3000/api/user/check-username?username=${username}`)
    )
  }

  // The register form polls this endpoint, so a wrong answer here is the visible
  // half of the bug: the form refuses a name registration would have accepted.
  it('offers a name that only matches an account through the ILIKE wildcard', async () => {
    rows = [account({ username: 'newXuser' })]

    const response = await check('new_user')
    const payload = await response.json()

    expect(payload.available).toBe(true)
  })

  it('still refuses a name an account holds with a literal underscore', async () => {
    rows = [account({ username: 'new_user' })]

    const response = await check('new_user')
    const payload = await response.json()

    expect(payload.available).toBe(false)
  })

  it('still refuses the same name in another case', async () => {
    rows = [account({ username: 'New_User' })]

    const response = await check('new_user')
    const payload = await response.json()

    expect(payload.available).toBe(false)
  })

  it('still offers a name nobody holds', async () => {
    rows = [account({ username: 'someone_else' })]

    const response = await check('new_user')
    const payload = await response.json()

    expect(payload.available).toBe(true)
  })
})

describe('PATCH /api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    rows = []
    installFakeDatabase()

    mockGetServerSession.mockResolvedValue({ user: { id: CALLER_ID } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: CALLER_ID,
      username: 'caller',
      email: 'caller@example.com',
      pendingEmail: null,
      image: null,
      avatarUrl: null,
      emailVerified: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      publicProfileId: 'caller-public-id',
      _count: {
        friendshipsInitiated: 0,
        friendshipsReceived: 0,
        players: 0,
        accounts: 0,
      },
    } as any)
    mockPrisma.players.count.mockResolvedValue(0)
    mockPrisma.userAchievements.findMany.mockResolvedValue([])
    mockPrisma.$transaction.mockImplementation(async (run: any) =>
      run({
        users: {
          update: jest.fn(async ({ data }: any) => ({
            id: CALLER_ID,
            username: data.username ?? 'caller',
            email: 'caller@example.com',
            pendingEmail: data.pendingEmail ?? null,
            image: null,
            avatarUrl: null,
            emailVerified: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            publicProfileId: 'caller-public-id',
            _count: {
              friendshipsInitiated: 0,
              friendshipsReceived: 0,
              players: 0,
              accounts: 0,
            },
          })),
        },
        emailVerificationTokens: { create: jest.fn(), deleteMany: jest.fn() },
      })
    )
  })

  function patch(body: unknown) {
    return patchProfile(
      new NextRequest('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )
  }

  it('accepts a username that only matches an account through the ILIKE wildcard', async () => {
    rows = [account({ username: 'newXuser' })]

    const response = await patch({ username: 'new_user' })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.user.username).toBe('new_user')
  })

  it('still refuses a username an account holds with a literal underscore', async () => {
    rows = [account({ username: 'new_user' })]

    const response = await patch({ username: 'new_user' })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toBe('Username is already taken')
  })

  // The address is likelier to carry an underscore than the display name is, and
  // the lookup two blocks below the username one had the same unescaped filter.
  it('accepts an email that only matches another account through the wildcard', async () => {
    rows = [account({ email: 'aXb@example.com' })]

    const response = await patch({ email: 'a_b@example.com' })

    expect(response.status).toBe(200)
  })

  it('still refuses an email another account really holds', async () => {
    rows = [account({ email: 'a_b@example.com' })]

    const response = await patch({ email: 'a_b@example.com' })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toBe('Email is already in use')
  })
})
