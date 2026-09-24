/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import { POST } from '@/app/api/auth/reset-password/route'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    passwordResetTokens: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationTokens: {
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>

function buildRequest(body: unknown, ip?: string) {
  return new NextRequest('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The route's own auth limiter allows five a window per address.
      ...(ip ? { 'x-real-ip': ip } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHash.mockResolvedValue('new-hash' as never)
    mockPrisma.users.findUnique.mockResolvedValue({ pendingEmail: null } as any)
  })

  it('returns validation issues for invalid password payload', async () => {
    const response = await POST(
      buildRequest({
        token: '',
        password: 'short',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  it('rejects invalid or missing reset tokens', async () => {
    mockPrisma.passwordResetTokens.findUnique.mockResolvedValue(null)

    const response = await POST(
      buildRequest({
        token: 'missing-token',
        password: 'ValidPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Invalid or expired reset token')
    expect(mockPrisma.users.update).not.toHaveBeenCalled()
  })

  it('deletes expired tokens and rejects the reset attempt', async () => {
    mockPrisma.passwordResetTokens.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      expires: new Date(Date.now() - 60_000),
    } as any)

    const response = await POST(
      buildRequest({
        token: 'expired-token',
        password: 'ValidPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Reset token has expired. Please request a new one.')
    expect(mockPrisma.passwordResetTokens.delete).toHaveBeenCalledWith({
      where: { id: 'token-1' },
    })
  })

  it('updates the user password and consumes the token on success', async () => {
    mockPrisma.passwordResetTokens.findUnique.mockResolvedValue({
      id: 'token-2',
      userId: 'user-2',
      expires: new Date(Date.now() + 60_000),
    } as any)

    const response = await POST(
      buildRequest({
        token: 'valid-token',
        password: 'ValidPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe('Password reset successfully')
    expect(mockHash).toHaveBeenCalledWith('ValidPass123!', 10)
    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { passwordHash: 'new-hash', sessionsValidFrom: expect.any(Date) },
    })
    expect(mockPrisma.passwordResetTokens.delete).toHaveBeenCalledWith({
      where: { id: 'token-2' },
    })
    expect(mockPrisma.emailVerificationTokens.deleteMany).not.toHaveBeenCalled()
  })

  // #1136: every session signed in before the reset stops working. The cutoff
  // is compared against the token's authenticatedAt in lib/next-auth.ts.
  it('sets the session cutoff to the moment of the reset', async () => {
    mockPrisma.passwordResetTokens.findUnique.mockResolvedValue({
      id: 'token-3',
      userId: 'user-3',
      expires: new Date(Date.now() + 60_000),
    } as any)
    const before = Date.now()

    await POST(buildRequest({ token: 'valid-token', password: 'ValidPass123!' }, '198.51.100.3'))

    const cutoff = mockPrisma.users.update.mock.calls[0][0].data.sessionsValidFrom as Date
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before)
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('cancels a pending email change and its verification link', async () => {
    mockPrisma.passwordResetTokens.findUnique.mockResolvedValue({
      id: 'token-4',
      userId: 'user-4',
      expires: new Date(Date.now() + 60_000),
    } as any)
    mockPrisma.users.findUnique.mockResolvedValue({ pendingEmail: 'attacker@example.com' } as any)

    const response = await POST(buildRequest({ token: 'valid-token', password: 'ValidPass123!' }, '198.51.100.4'))

    expect(response.status).toBe(200)
    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-4' },
      data: {
        passwordHash: 'new-hash',
        sessionsValidFrom: expect.any(Date),
        pendingEmail: null,
      },
    })
    expect(mockPrisma.emailVerificationTokens.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-4' },
    })
  })
})
