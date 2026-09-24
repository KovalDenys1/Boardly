/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

/**
 * #1055, first finding - a free username or address can be refused.
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
 *
 * Every test here fails against origin/develop. Three groups, one per thing the
 * fix is made of:
 *
 * 1. The four routes, against a database that honours the escaping - the answers
 *    the product gives. Each case asserts the free name is offered *and* that a
 *    name really held is still refused, in one test, because a "still refuses"
 *    test on its own passes on develop too (develop refuses everything) and
 *    would pad the suite with a guard that cannot fail for this change.
 *
 * 2. The same routes with `driverHonoursEscapes` off: a driver that drops the
 *    escaping and applies the raw pattern. That is not hypothetical - it is what
 *    these routes did before this branch, and what they do again if the escaping
 *    stops reaching the database. `sameName` is the step that keeps the answer
 *    right there, so that is the condition it is tested under.
 *
 * 3. `escapeLikeValue` itself, through an independent implementation of LIKE.
 *
 * What none of this can check is that Prisma still compiles the filter to a
 * pattern at all - see the note in lib/username-match.ts, which carries the
 * queries to re-run against a real database on an upgrade.
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { escapeLikeValue } from '@/lib/username-match'
import { GET as checkUsername } from '@/app/api/user/check-username/route'
import { GET as checkEmail } from '@/app/api/user/check-email/route'
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
  sendEmailChangeNoticeEmail: jest.fn(async () => ({ success: true })),
}))

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'token') }))

jest.mock('@/lib/error-handler', () => {
  class AppError extends Error {
    constructor(message: string, public statusCode = 500, public code?: string) {
      super(message)
    }
  }
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
    AppError,
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
 * Whether the fake database honours a `\` escape in the pattern it is given.
 *
 * True is Postgres. False is a driver that drops the escaping on its way to the
 * database - the state these routes were in before this branch, and the state
 * they return to if the escape is ever neutered, forgotten at a call site, or
 * escaped a second time by Prisma itself. The routes have to answer correctly
 * either way, and that is `sameName`'s job.
 */
let driverHonoursEscapes = true

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
      if (!driverHonoursEscapes) {
        // The escape never reaches the database: the character it was protecting
        // is read as a metacharacter again.
        continue
      }

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

function resetDatabase() {
  jest.clearAllMocks()
  rows = []
  driverHonoursEscapes = true
  installFakeDatabase()
}

describe('GET /api/user/check-username', () => {
  beforeEach(resetDatabase)

  async function available(username: string) {
    const response = await checkUsername(
      new NextRequest(`http://localhost:3000/api/user/check-username?username=${username}`)
    )
    return (await response.json()).available
  }

  // The register form polls this endpoint, so a wrong answer here is the visible
  // half of the bug: the form refuses a name registration would have accepted.
  it('offers a name only the wildcard ties to an account, and still refuses the account holding it', async () => {
    rows = [account({ username: 'newXuser' })]
    expect(await available('new_user')).toBe(true)

    rows = [account({ username: 'someone_else' })]
    expect(await available('new_user')).toBe(true)

    rows = [account({ username: 'new_user' })]
    expect(await available('new_user')).toBe(false)

    rows = [account({ username: 'New_User' })]
    expect(await available('new_user')).toBe(false)
  })

  it('answers from the rows it compared when the escape does not reach the database', async () => {
    driverHonoursEscapes = false
    rows = [account({ username: 'newXuser' })]

    // The filter hands back a stranger's row, as it did before this branch. The
    // comparison is what stops that row being read as the holder of the name.
    expect(await available('new_user')).toBe(true)

    rows = [account({ username: 'new_user' })]
    expect(await available('new_user')).toBe(false)
  })
})

describe('GET /api/user/check-email', () => {
  beforeEach(resetDatabase)

  async function available(email: string) {
    const response = await checkEmail(
      new NextRequest(`http://localhost:3000/api/user/check-email?email=${encodeURIComponent(email)}`)
    )
    return (await response.json()).available
  }

  // app/profile/page.tsx returns before sending the PATCH when this endpoint
  // answers `available: false` (:832, :921, :941), so the writer being fixed
  // changes nothing a user can see until this one is fixed as well.
  it('offers an address only the wildcard ties to an account, and still refuses the ones really held', async () => {
    rows = [account({ email: 'aXb@example.com' })]
    expect(await available('a_b@example.com')).toBe(true)

    rows = [account({ email: 'a_b@example.com' })]
    expect(await available('a_b@example.com')).toBe(false)

    rows = [account({ email: 'A_B@example.com' })]
    expect(await available('a_b@example.com')).toBe(false)

    rows = [account({ email: 'other@example.com', pendingEmail: 'a_b@example.com' })]
    expect(await available('a_b@example.com')).toBe(false)
  })

  it('answers from the rows it compared when the escape does not reach the database', async () => {
    driverHonoursEscapes = false
    rows = [account({ email: 'aXb@example.com' })]

    expect(await available('a_b@example.com')).toBe(true)

    rows = [account({ email: 'other@example.com', pendingEmail: 'aXb@example.com' })]
    expect(await available('a_b@example.com')).toBe(true)
  })
})

describe('PATCH /api/user/profile', () => {
  beforeEach(() => {
    resetDatabase()

    // A fresh sign-in: the email change below needs one (#1136).
    mockGetServerSession.mockResolvedValue({ user: { id: CALLER_ID, authenticatedAt: Date.now() } } as any)
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

  it('takes a username only the wildcard ties to an account, and still refuses the account holding it', async () => {
    rows = [account({ username: 'newXuser' })]

    const accepted = await patch({ username: 'new_user' })
    expect(accepted.status).toBe(200)
    expect((await accepted.json()).user.username).toBe('new_user')

    rows = [account({ username: 'new_user' })]

    const refused = await patch({ username: 'new_user' })
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toBe('Username is already taken')
  })

  it('answers a username from the rows it compared when the escape does not reach the database', async () => {
    driverHonoursEscapes = false
    rows = [account({ username: 'newXuser' })]

    expect((await patch({ username: 'new_user' })).status).toBe(200)

    rows = [account({ username: 'new_user' })]
    expect((await patch({ username: 'new_user' })).status).toBe(409)
  })

  // The address is likelier to carry an underscore than the display name is, and
  // the lookup two blocks below the username one had the same unescaped filter.
  it('takes an address only the wildcard ties to an account, and still refuses the one really held', async () => {
    rows = [account({ email: 'aXb@example.com' })]
    expect((await patch({ email: 'a_b@example.com' })).status).toBe(200)

    rows = [account({ email: 'a_b@example.com' })]

    const refused = await patch({ email: 'a_b@example.com' })
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toBe('Email is already in use')
  })

  it('answers an address from the rows it compared when the escape does not reach the database', async () => {
    driverHonoursEscapes = false
    rows = [account({ email: 'aXb@example.com' })]

    expect((await patch({ email: 'a_b@example.com' })).status).toBe(200)

    rows = [account({ email: 'other@example.com', pendingEmail: 'aXb@example.com' })]
    expect((await patch({ email: 'a_b@example.com' })).status).toBe(200)

    rows = [account({ email: 'a_b@example.com' })]
    expect((await patch({ email: 'a_b@example.com' })).status).toBe(409)
  })
})

describe('escapeLikeValue', () => {
  beforeEach(() => {
    driverHonoursEscapes = true
  })

  // Run through the independent LIKE above, not through an assertion on the
  // string it returns: what matters is which rows the pattern can reach.
  it('escapes the LIKE metacharacters so a pattern matches only its own literal', () => {
    expect(ilike('new_user', escapeLikeValue('new_user'))).toBe(true)
    expect(ilike('newXuser', escapeLikeValue('new_user'))).toBe(false)
    expect(ilike('NEW_USER', escapeLikeValue('new_user'))).toBe(true)

    expect(ilike('a%b@example.com', escapeLikeValue('a%b@example.com'))).toBe(true)
    expect(ilike('aZZb@example.com', escapeLikeValue('a%b@example.com'))).toBe(false)

    expect(ilike('a\\b', escapeLikeValue('a\\b'))).toBe(true)
    expect(ilike('a_b', escapeLikeValue('a\\b'))).toBe(false)
  })
})
