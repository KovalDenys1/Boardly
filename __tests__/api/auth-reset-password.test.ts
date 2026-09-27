/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import { POST } from '@/app/api/auth/reset-password/route'
import { prisma } from '@/lib/db'
import { hashAuthToken } from '@/lib/auth-tokens'

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

// The table as the route sees it (#1141): rows issued now carry only tokenHash and a
// purpose; rows issued before carry the raw token, deletion ones with a DELETE_ prefix.
type TokenRow = { id: string; userId: string; expires: Date; token?: string | null; tokenHash?: string | null; purpose?: 'reset' | 'delete' }
function useTokenRows(rows: TokenRow[]) {
  const table = rows.map((row) => ({ token: null, tokenHash: null, purpose: 'reset', ...row }))
  mockPrisma.passwordResetTokens.findUnique.mockImplementation((async ({ where }: { where: Record<string, string> }) => {
    if ('tokenHash' in where) return table.find((row) => row.tokenHash === where.tokenHash) ?? null
    if ('token' in where) return table.find((row) => row.token === where.token) ?? null
    return null
  }) as any)
}
function hashedRow(id: string, userId: string, rawToken: string, offsetMs = 60_000, purpose: 'reset' | 'delete' = 'reset'): TokenRow {
  return { id, userId, tokenHash: hashAuthToken(rawToken), purpose, expires: new Date(Date.now() + offsetMs) }
}

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
    useTokenRows([])

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
    useTokenRows([hashedRow('token-1', 'user-1', 'expired-token', -60_000)])

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
    useTokenRows([hashedRow('token-2', 'user-2', 'valid-token')])

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
    useTokenRows([hashedRow('token-3', 'user-3', 'valid-token')])
    const before = Date.now()

    await POST(buildRequest({ token: 'valid-token', password: 'ValidPass123!' }, '198.51.100.3'))

    const cutoff = mockPrisma.users.update.mock.calls[0][0].data.sessionsValidFrom as Date
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before)
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('cancels a pending email change and its verification link', async () => {
    useTokenRows([hashedRow('token-4', 'user-4', 'valid-token')])
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
  // #1141: the token is looked up by its hash, and only a reset token resets.
  describe('token purpose and hashing (#1141)', () => {
    it('looks the token up by its SHA-256, never by the raw value first', async () => {
      useTokenRows([hashedRow('token-5', 'user-5', 'valid-token')])

      await POST(buildRequest({ token: 'valid-token', password: 'ValidPass123!' }, '198.51.100.5'))

      expect(mockPrisma.passwordResetTokens.findUnique.mock.calls[0][0]).toEqual({
        where: { tokenHash: hashAuthToken('valid-token') },
      })
      expect(mockPrisma.users.update).toHaveBeenCalled()
    })

    it('answers 400 to an account deletion token and changes nothing', async () => {
      useTokenRows([hashedRow('token-6', 'user-6', 'deletion-token', 60_000, 'delete')])

      const response = await POST(buildRequest({ token: 'deletion-token', password: 'ValidPass123!' }, '198.51.100.6'))

      expect(response.status).toBe(400)
      expect(mockPrisma.users.update).not.toHaveBeenCalled()
      expect(mockPrisma.passwordResetTokens.delete).not.toHaveBeenCalled()
    })

    it('answers 400 to a pre-#1141 deletion token pasted with its DELETE_ prefix', async () => {
      useTokenRows([{ id: 'token-7', userId: 'user-7', token: 'DELETE_abc123', expires: new Date(Date.now() + 60_000) }])

      const response = await POST(buildRequest({ token: 'DELETE_abc123', password: 'ValidPass123!' }, '198.51.100.7'))

      expect(response.status).toBe(400)
      expect(mockPrisma.users.update).not.toHaveBeenCalled()
    })

    it('still accepts a reset link issued before the change, until it expires', async () => {
      useTokenRows([{ id: 'token-8', userId: 'user-8', token: 'legacy-raw-token', expires: new Date(Date.now() + 60_000) }])

      const response = await POST(buildRequest({ token: 'legacy-raw-token', password: 'ValidPass123!' }, '198.51.100.8'))

      expect(response.status).toBe(200)
      expect(mockPrisma.passwordResetTokens.delete).toHaveBeenCalledWith({ where: { id: 'token-8' } })
    })

    it('does not accept a stored hash posted back as if it were the token', async () => {
      const row = hashedRow('token-9', 'user-9', 'valid-token')
      useTokenRows([row])

      const response = await POST(buildRequest({ token: row.tokenHash, password: 'ValidPass123!' }, '198.51.100.9'))

      expect(response.status).toBe(400)
      expect(mockPrisma.users.update).not.toHaveBeenCalled()
    })
  })
})
