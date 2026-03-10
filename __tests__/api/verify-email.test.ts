/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/verify-email/route'
import { prisma } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email'
import { ensureUserHasFriendCode } from '@/lib/friend-code'

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

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendWelcomeEmail = sendWelcomeEmail as jest.MockedFunction<typeof sendWelcomeEmail>
const mockEnsureUserHasFriendCode =
  ensureUserHasFriendCode as jest.MockedFunction<typeof ensureUserHasFriendCode>

describe('POST /api/auth/verify-email', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('moves pending email into the primary email on verification', async () => {
    mockPrisma.emailVerificationTokens.findUnique.mockResolvedValue({
      userId: 'user-1',
      token: 'valid-token',
      expires: new Date(Date.now() + 60_000),
    } as any)
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
      body: JSON.stringify({ token: 'valid-token' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      message: 'New email verified successfully',
    })
    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(mockTransactionClient.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          email: 'new@example.com',
          pendingEmail: null,
          emailVerified: expect.any(Date),
        }),
      })
    )
    expect(mockTransactionClient.emailVerificationTokens.delete).toHaveBeenCalledWith({
      where: { token: 'valid-token' },
    })
    expect(mockEnsureUserHasFriendCode).toHaveBeenCalledWith('user-1')
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled()
  })
})
