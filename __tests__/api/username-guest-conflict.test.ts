/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

/**
 * #1050 - the two username surfaces that are not registration.
 *
 * `Users.username` is `@unique`, so a guest display name occupies the name for
 * real accounts too. #1047 raised guest retention from 3 days to 90 for a guest
 * who has played, which is what made that worth fixing.
 *
 * Registration renames the guest out of the way (see auth-register.test.ts).
 * These two have to agree with it, or the app tells a visitor to pick another
 * name while the writer behind it would have accepted the one they wanted:
 *
 * - GET  /api/user/check-username - what the register form and the profile page poll
 * - PATCH /api/user/profile       - the other writer that takes a username
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
    players: {
      count: jest.fn(),
    },
    userAchievements: {
      findMany: jest.fn(),
    },
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

// Production shapes: an account id is a cuid (Users.id @default(cuid())), a guest
// id is `guest-<uuid>` from createGuestId() in lib/guest-auth.ts.
const ACCOUNT_ID = 'cmf9x2k7t0000l908h3j2b5qk'
const OTHER_ACCOUNT_ID = 'cmf9x2k7t0001l908abcd1234'
const GUEST_ID = 'guest-8f14e45f-ceea-467a-9a3b-1c2d3e4f5a6b'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('GET /api/user/check-username', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.users.findMany.mockResolvedValue([])
  })

  function request(username: string) {
    return new NextRequest(
      `http://localhost:3000/api/user/check-username?username=${encodeURIComponent(username)}`
    )
  }

  it('excludes guest rows from the lookup, so a guest name reads as available', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null)

    const payload = await (await checkUsername(request('Denys'))).json()

    expect(payload.available).toBe(true)
    expect(mockPrisma.users.findFirst).toHaveBeenCalledWith({
      where: {
        username: { equals: 'Denys', mode: 'insensitive' },
        isGuest: false,
      },
      select: { id: true },
    })
  })

  it('still reports a name held by a real account as taken', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({ id: ACCOUNT_ID })
    mockPrisma.users.findMany.mockResolvedValue([{ username: 'Denys' }])

    const payload = await (await checkUsername(request('Denys'))).json()

    expect(payload.available).toBe(false)
    expect(payload.suggestions[0]).toBe('Denys1')
  })

  it('does not let a guest name suppress a suggestion', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({ id: ACCOUNT_ID })
    mockPrisma.users.findMany.mockResolvedValue([{ username: 'Denys' }])

    await checkUsername(request('Denys'))

    expect(mockPrisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isGuest: false }),
      })
    )
  })
})

describe('PATCH /api/user/profile - username', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setUpProfileMocks()
  })

  function setUpProfileMocks() {
    mockPrisma.users.findMany.mockResolvedValue([])
    mockPrisma.users.findFirst.mockResolvedValue(null)
    mockGetServerSession.mockResolvedValue({ user: { id: ACCOUNT_ID } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      username: 'Player One',
      email: 'player@example.com',
      pendingEmail: null,
      image: null,
      avatarUrl: null,
      emailVerified: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      publicProfileId: 'public-id',
      _count: {
        friendshipsInitiated: 0,
        friendshipsReceived: 0,
        players: 0,
        accounts: 1,
      },
    } as any)
    mockPrisma.players.count.mockResolvedValue(0)
    mockPrisma.userAchievements.findMany.mockResolvedValue([])
    mockPrisma.users.update.mockResolvedValue({ id: GUEST_ID, username: 'Denys-8f14e4' } as any)
    mockPrisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        users: {
          update: jest.fn(async () => ({
            id: ACCOUNT_ID,
            username: 'Denys',
            email: 'player@example.com',
            pendingEmail: null,
            image: null,
            avatarUrl: null,
            emailVerified: new Date('2026-01-01T00:00:00.000Z'),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            publicProfileId: 'public-id',
            _count: {
              friendshipsInitiated: 0,
              friendshipsReceived: 0,
              players: 0,
              accounts: 1,
            },
          })),
        },
        emailVerificationTokens: {
          deleteMany: jest.fn(),
          create: jest.fn(),
        },
      })
    )
  }

  function request(username: string) {
    return new NextRequest('http://localhost:3000/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
  }

  it('renames the guest holding the name and takes it', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      { id: GUEST_ID, username: 'Denys', isGuest: true },
    ])

    const response = await patchProfile(request('Denys'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.user.username).toBe('Denys')
    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: GUEST_ID },
      data: { username: 'Denys-8f14e4' },
    })
  })

  it('still refuses a name held by another real account', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      { id: OTHER_ACCOUNT_ID, username: 'Denys', isGuest: false },
    ])

    const response = await patchProfile(request('Denys'))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toBe('Username is already taken')
    expect(mockPrisma.users.update).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses when the guest rename loses its race', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      { id: GUEST_ID, username: 'Denys', isGuest: true },
    ])
    mockPrisma.users.update.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    )

    const response = await patchProfile(request('Denys'))
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toBe('Username is already taken')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  // The lookup is case-insensitive, `Users_username_key` is not: it is
  // `CREATE UNIQUE INDEX "Users_username_key" ON public."Users" USING btree
  // (username)` on the live database, with no lower(). So "Denys" and "denys" are
  // two legal rows, and getOrCreateGuestUser (lib/guest-helpers.ts) looks a new
  // guest's name up with `where: { username }` - exact - so a guest typing
  // "denys" while the account "Denys" exists is created under that name. Both
  // rows then match this route's insensitive lookup.
  describe('when a guest and a real account differ only in case', () => {
    const bothRows = [
      { id: GUEST_ID, username: 'denys', isGuest: true },
      { id: OTHER_ACCOUNT_ID, username: 'Denys', isGuest: false },
    ]

    it('refuses, whichever of the two the database lists first', async () => {
      for (const rows of [bothRows, [...bothRows].reverse()]) {
        jest.clearAllMocks()
        setUpProfileMocks()
        mockPrisma.users.findMany.mockResolvedValue(rows)

        const response = await patchProfile(request('DENYS'))
        const payload = await response.json()

        expect(response.status).toBe(409)
        expect(payload.error).toBe('Username is already taken')
        expect(mockPrisma.users.update).not.toHaveBeenCalled()
        expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      }
    })

    it('reads every matching row rather than one of them', async () => {
      mockPrisma.users.findMany.mockResolvedValue(bothRows)

      await patchProfile(request('DENYS'))

      expect(mockPrisma.users.findMany).toHaveBeenCalledWith({
        where: {
          username: { equals: 'DENYS', mode: 'insensitive' },
          NOT: { id: ACCOUNT_ID },
        },
        select: { id: true, username: true, isGuest: true },
      })
    })
  })

  it('leaves a guest whose name differs only in case alone', async () => {
    // Nothing is in the way: the index is case-sensitive, so "DENYS" can be
    // written while the guest keeps "denys". Renaming it would be churn on a row
    // that is not involved.
    mockPrisma.users.findMany.mockResolvedValue([
      { id: GUEST_ID, username: 'denys', isGuest: true },
    ])

    const response = await patchProfile(request('DENYS'))

    expect(response.status).toBe(200)
    expect(mockPrisma.users.update).not.toHaveBeenCalled()
  })

  // The rename and the write cannot share a transaction - an interactive Prisma
  // transaction aborts on the first failed statement, so releaseGuestUsername's
  // P2002 retry could not run inside one. That leaves a window between freeing
  // the name and taking it.
  describe('when the write loses the race for the freed name', () => {
    function loseTheRace() {
      mockPrisma.users.findMany.mockResolvedValue([
        { id: GUEST_ID, username: 'Denys', isGuest: true },
      ])
      mockPrisma.$transaction.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed on the fields: (`username`)'), {
          code: 'P2002',
          meta: { target: ['username'] },
        })
      )
    }

    it('answers 409, not 500', async () => {
      loseTheRace()

      const response = await patchProfile(request('Denys'))
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toBe('Username is already taken')
    })

    it('hands the guest its display name back', async () => {
      loseTheRace()

      await patchProfile(request('Denys'))

      expect(mockPrisma.users.update).toHaveBeenLastCalledWith({
        where: { id: GUEST_ID },
        data: { username: 'Denys' },
      })
    })

    it('still reports a failure that is not a collision as a server error', async () => {
      mockPrisma.users.findMany.mockResolvedValue([])
      mockPrisma.$transaction.mockRejectedValue(new Error('connection terminated'))

      const response = await patchProfile(request('Denys'))

      expect(response.status).toBe(500)
    })
  })
})
