/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/verify-email/route'
import { prisma } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email'
import { ensureUserHasFriendCode } from '@/lib/friend-code'
import { hashAuthToken } from '@/lib/auth-tokens'

const mockTransactionClient = {
  users: {
    update: jest.fn(),
  },
  emailVerificationTokens: {
    delete: jest.fn(),
  },
}

jest.mock('@/lib/db', () => ({
  prisma: {
    emailVerificationTokens: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback(mockTransactionClient)),
  },
}))

jest.mock('@/lib/email', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
}))

jest.mock('@/lib/friend-code', () => ({
  ensureUserHasFriendCode: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/rate-limit', () => {
  const limiter = jest.fn(() => Promise.resolve(null))
  return {
    rateLimit: jest.fn(() => limiter),
    rateLimitPresets: { api: {} },
    __limiter: limiter,
  }
})

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendWelcomeEmail = sendWelcomeEmail as jest.MockedFunction<typeof sendWelcomeEmail>
const mockEnsureUserHasFriendCode =
  ensureUserHasFriendCode as jest.MockedFunction<typeof ensureUserHasFriendCode>
const rateLimiterMock = (jest.requireMock('@/lib/rate-limit') as { __limiter: jest.Mock }).__limiter
const VALID_TOKEN = 'a-valid-verification-token-32chars'

describe('POST /api/auth/verify-email', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    rateLimiterMock.mockImplementation(() => Promise.resolve(null))
  })

  it('moves pending email into the primary email on verification', async () => {
    // A row as written since #1141: the hash of the emailed token, no raw value.
    mockPrisma.emailVerificationTokens.findUnique.mockImplementation((async ({ where }: any) =>
      where.tokenHash === hashAuthToken(VALID_TOKEN)
        ? { id: 'token-1', userId: 'user-1', token: null, tokenHash: where.tokenHash, expires: new Date(Date.now() + 60_000) }
        : null) as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'old@example.com',
      pendingEmail: 'new@example.com',
      username: 'player-one',
      emailVerified: new Date('2026-01-01T00:00:00.000Z'),
    } as any)
    mockTransactionClient.users.update.mockResolvedValue({ id: 'user-1' } as any)
    mockTransactionClient.emailVerificationTokens.delete.mockResolvedValue({ id: 'token-1' } as any)

    const request = new NextRequest('http://localhost:3000/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: VALID_TOKEN }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      message: 'New email verified successfully',
      signedOut: true,
    })
    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(mockTransactionClient.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          email: 'new@example.com',
          pendingEmail: null,
          emailVerified: expect.any(Date),
          // A completed email change ends every earlier session (#1136).
          sessionsValidFrom: expect.any(Date),
        }),
      })
    )
    expect(mockPrisma.emailVerificationTokens.findUnique.mock.calls[0][0]).toEqual({
      where: { tokenHash: hashAuthToken(VALID_TOKEN) },
    })
    expect(mockTransactionClient.emailVerificationTokens.delete).toHaveBeenCalledWith({
      where: { id: 'token-1' },
    })
    expect(mockEnsureUserHasFriendCode).toHaveBeenCalledWith('user-1')
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled()
  })

  // #1119 (audit S2-04): an object or array token used to reach `findUnique` and come back
  // as an unhandled Prisma validation error (a 500) instead of a 400.
  it('returns 400 for a non-string token instead of reaching the database', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: {} }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Token is required' })
    expect(mockPrisma.emailVerificationTokens.findUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for a token shorter than 16 characters', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'short' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockPrisma.emailVerificationTokens.findUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for a token longer than 64 characters', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'x'.repeat(65) }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockPrisma.emailVerificationTokens.findUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for a missing body', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/verify-email', {
      method: 'POST',
      body: '',
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('is rate limited', async () => {
    const limited = new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })
    rateLimiterMock.mockImplementation(() => Promise.resolve(limited as any))

    const request = new NextRequest('http://localhost:3000/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: VALID_TOKEN }),
    })

    const response = await POST(request)

    expect(response.status).toBe(429)
    expect(mockPrisma.emailVerificationTokens.findUnique).not.toHaveBeenCalled()
  })
})
