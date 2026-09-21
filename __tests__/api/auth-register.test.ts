/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/register/route'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/email'
import { nanoid } from 'nanoid'

let mockRateLimitResult: Response | null = null

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationTokens: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendVerificationEmail: jest.fn(),
}))

jest.mock('nanoid', () => ({
  nanoid: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => mockRateLimitResult)),
  rateLimitPresets: {
    auth: {},
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>
const mockSendVerificationEmail = sendVerificationEmail as jest.MockedFunction<typeof sendVerificationEmail>
const mockNanoid = nanoid as jest.MockedFunction<typeof nanoid>

// Production shapes. A registered account's id is a cuid (Users.id
// @default(cuid()) in prisma/schema.prisma); a guest sets its own id, and
// createGuestId() in lib/guest-auth.ts mints `guest-<uuid>`.
const REAL_USER_ID = 'cmf9x2k7t0000l908h3j2b5qk'
const GUEST_ID = 'guest-8f14e45f-ceea-467a-9a3b-1c2d3e4f5a6b'

function uniqueConstraintError() {
  return Object.assign(new Error('Unique constraint failed on the fields: (`username`)'), {
    code: 'P2002',
  })
}

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRateLimitResult = null
    mockHashPassword.mockResolvedValue('hashed-password')
    mockSendVerificationEmail.mockResolvedValue({ success: true })
    mockNanoid.mockReturnValue('verification-token')
    mockPrisma.users.findMany.mockResolvedValue([])
    mockPrisma.users.update.mockResolvedValue({} as any)
    mockPrisma.users.create.mockResolvedValue({
      id: REAL_USER_ID,
      email: 'new@example.com',
      username: 'new_user',
    } as any)
  })

  it('returns the limiter response when registration is rate limited', async () => {
    mockRateLimitResult = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )

    expect(response.status).toBe(429)
    expect(mockPrisma.users.findMany).not.toHaveBeenCalled()
  })

  it('rejects a duplicate email during initial lookup', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      { id: REAL_USER_ID, email: 'new@example.com', username: 'someone_else', isGuest: false },
    ] as any)

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Email or username already exists')
    expect(mockPrisma.users.create).not.toHaveBeenCalled()
  })

  // GET /api/user/check-username - what this form polls - has always answered
  // case-insensitively, so an exact lookup here let a signup take a name the form
  // had just called taken, and put "DENYS" next to the account "Denys".
  it('rejects a username that a real account holds in another case', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      { id: REAL_USER_ID, email: 'taken@example.com', username: 'New_User', isGuest: false },
    ] as any)

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Email or username already exists')
    expect(mockPrisma.users.create).not.toHaveBeenCalled()
  })

  it('rejects a username collision found during initial lookup', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      { id: REAL_USER_ID, email: 'taken@example.com', username: 'new_user', isGuest: false },
    ] as any)

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Email or username already exists')
    expect(mockPrisma.users.create).not.toHaveBeenCalled()
    expect(mockPrisma.users.update).not.toHaveBeenCalled()
  })

  // #1050. Users.username is @unique, so a guest who typed "new_user" once held
  // that signup name for as long as their row lived - three days before #1047,
  // ninety days after it. The guest is renamed out of the way instead.
  describe('a username held only by a guest row (#1050)', () => {
    const guestHolding = (username: string) => [
      {
        id: GUEST_ID,
        email: `guest-${GUEST_ID}@boardly.guest`,
        username,
        isGuest: true,
      },
    ]

    it('registers the visitor and renames the guest instead of refusing', async () => {
      mockPrisma.users.findMany.mockResolvedValue(guestHolding('new_user') as any)

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.user.username).toBe('new_user')
      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { id: GUEST_ID },
        data: { username: 'new_user-8f14e4' },
      })
      expect(mockPrisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'new_user' }),
        })
      )
    })

    it('keeps the guest row, so their games are not cascaded away', async () => {
      mockPrisma.users.findMany.mockResolvedValue(guestHolding('new_user') as any)

      await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )

      const renameCall = mockPrisma.users.update.mock.calls[0][0]
      expect(Object.keys(renameCall.data)).toEqual(['username'])
      expect(mockPrisma.users.update).toHaveBeenCalledTimes(1)
    })

    it('still refuses when a guest row holds the email', async () => {
      // Guests carry a placeholder `guest-<id>@boardly.guest` address, so this is
      // the defensive case: an email is the one field that really is the person
      // and is never freed by renaming, whoever holds it.
      mockPrisma.users.findMany.mockResolvedValue([
        { id: GUEST_ID, email: 'new@example.com', username: 'Wandering Dice', isGuest: true },
      ] as any)

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload.error).toBe('Email or username already exists')
      expect(mockPrisma.users.update).not.toHaveBeenCalled()
      expect(mockPrisma.users.create).not.toHaveBeenCalled()
    })

    // The rows differ in case, which is the only way two of them can hold one
    // name: `Users_username_key` is `CREATE UNIQUE INDEX "Users_username_key" ON
    // public."Users" USING btree (username)` on the live database, with no
    // lower(), and getOrCreateGuestUser looks a new guest's name up with
    // `where: { username }` - exact - so a guest typing "new_user" while the
    // account "New_User" exists is created under that name. An earlier version of
    // this test gave both rows the identical username, which the unique index
    // forbids, so it passed against a lookup that could never return two rows.
    it('refuses when a real account holds the name in another case and a guest holds it too', async () => {
      mockPrisma.users.findMany.mockResolvedValue([
        { id: GUEST_ID, email: `guest-${GUEST_ID}@boardly.guest`, username: 'new_user', isGuest: true },
        { id: REAL_USER_ID, email: 'taken@example.com', username: 'New_User', isGuest: false },
      ] as any)

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.users.update).not.toHaveBeenCalled()
      expect(mockPrisma.users.create).not.toHaveBeenCalled()
    })

    it('refuses whichever order the two rows come back in', async () => {
      mockPrisma.users.findMany.mockResolvedValue([
        { id: REAL_USER_ID, email: 'taken@example.com', username: 'New_User', isGuest: false },
        { id: GUEST_ID, email: `guest-${GUEST_ID}@boardly.guest`, username: 'new_user', isGuest: true },
      ] as any)

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.users.update).not.toHaveBeenCalled()
      expect(mockPrisma.users.create).not.toHaveBeenCalled()
    })

    it('leaves a guest whose name differs only in case alone', async () => {
      // Nothing is in the way - the index is case-sensitive - so the signup goes
      // through and the guest keeps its display name.
      mockPrisma.users.findMany.mockResolvedValue(guestHolding('New_User') as any)

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )

      expect(response.status).toBe(200)
      expect(mockPrisma.users.update).not.toHaveBeenCalled()
    })

    it('registers the visitor when the guest row vanished before the rename', async () => {
      // scripts/cleanup-old-guests.ts and /api/user/upgrade-guest both delete
      // guest rows, and either can land between the lookup and the rename. The
      // name is free, so the signup should go through; this used to be a 500.
      mockPrisma.users.findMany.mockResolvedValue(guestHolding('new_user') as any)
      mockPrisma.users.update.mockRejectedValue(
        Object.assign(new Error('An operation failed because it depends on one or more records that were required but not found.'), {
          code: 'P2025',
        })
      )

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload.user.username).toBe('new_user')
      expect(mockPrisma.users.create).toHaveBeenCalled()
    })

    it('gives up cleanly when every rename of the guest collides', async () => {
      mockPrisma.users.findMany.mockResolvedValue(guestHolding('new_user') as any)
      mockPrisma.users.update.mockRejectedValue(uniqueConstraintError())

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload.error).toBe('Email or username already exists')
      expect(mockPrisma.users.create).not.toHaveBeenCalled()
    })
  })

  // #1055. The rename is a committed write of its own, so the guest is renamed
  // for a signup that then does not happen - and this route answered its own
  // lost race with a 400 and left the visitor renamed for nothing.
  describe('when the signup fails after the guest name was freed', () => {
    function guestHoldsTheName() {
      mockPrisma.users.findMany.mockResolvedValue([
        {
          id: GUEST_ID,
          email: `guest-${GUEST_ID}@boardly.guest`,
          username: 'new_user',
          isGuest: true,
        },
      ] as any)
    }

    it('hands the name back when the create loses the unique-index race', async () => {
      guestHoldsTheName()
      mockPrisma.users.create.mockRejectedValue(uniqueConstraintError())

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload.error).toBe('Email or username already exists')
      expect(mockPrisma.users.update).toHaveBeenLastCalledWith({
        where: { id: GUEST_ID },
        data: { username: 'new_user' },
      })
    })

    it('hands the name back when the create fails for a reason nobody enumerated', async () => {
      // The point of doing this in one place rather than per known failure: a
      // path nobody listed is covered by having been written inside the scope.
      guestHoldsTheName()
      mockPrisma.users.create.mockRejectedValue(new Error('connection terminated'))

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )

      expect(response.status).toBe(500)
      expect(mockPrisma.users.update).toHaveBeenLastCalledWith({
        where: { id: GUEST_ID },
        data: { username: 'new_user' },
      })
    })

    it('leaves the guest renamed once the account actually holds the name', async () => {
      guestHoldsTheName()

      const response = await POST(
        buildRequest({
          email: 'new@example.com',
          username: 'new_user',
          password: 'ValidPass123',
        })
      )

      expect(response.status).toBe(200)
      expect(mockPrisma.users.update).toHaveBeenCalledTimes(1)
      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { id: GUEST_ID },
        data: { username: 'new_user-8f14e4' },
      })
    })
  })

  it('answers a create that loses the unique-index race with 400, not 500', async () => {
    mockPrisma.users.create.mockRejectedValue(uniqueConstraintError())

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Email or username already exists')
  })

  it('still reports a genuine database failure as a server error', async () => {
    mockPrisma.users.create.mockRejectedValue(new Error('connection terminated'))

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('Internal server error')
  })

  it('returns validation issues for invalid input', async () => {
    const response = await POST(
      buildRequest({
        email: 'not-an-email',
        username: 'ab',
        password: 'short',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(Array.isArray(payload.error)).toBe(true)
    expect(mockPrisma.users.findMany).not.toHaveBeenCalled()
  })

  it('hashes the password, creates the user, and stores a verification token', async () => {
    const response = await POST(
      buildRequest({
        email: 'NEW@Example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockHashPassword).toHaveBeenCalledWith('ValidPass123')
    // The underscores are escaped because the insensitive filter compiles to an
    // ILIKE, where a bare `_` matches any character (#1055).
    expect(mockPrisma.users.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            email: {
              equals: 'new@example.com',
              mode: 'insensitive',
            },
          },
          {
            username: {
              equals: 'new\\_user',
              mode: 'insensitive',
            },
          },
        ],
      },
      select: { id: true, email: true, username: true, isGuest: true },
    })
    expect(mockPrisma.users.create).toHaveBeenCalledWith({
      data: {
        email: 'new@example.com',
        username: 'new_user',
        passwordHash: 'hashed-password',
        signupSource: null,
      },
    })
    expect(mockPrisma.emailVerificationTokens.create).toHaveBeenCalledWith({
      data: {
        userId: REAL_USER_ID,
        token: 'verification-token',
        expires: expect.any(Date),
      },
    })
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('new@example.com', 'verification-token')
    expect(payload.user).toEqual({
      id: REAL_USER_ID,
      email: 'new@example.com',
      username: 'new_user',
      emailVerified: false,
    })
  })

  it('returns success even when verification email sending fails', async () => {
    mockSendVerificationEmail.mockResolvedValue({
      success: false,
      error: 'provider unavailable',
    })

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )

    expect(response.status).toBe(200)
    expect(mockPrisma.emailVerificationTokens.create).toHaveBeenCalledTimes(1)
  })
})
