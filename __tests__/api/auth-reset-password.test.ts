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
      update: jest.fn(),
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

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHash.mockResolvedValue('new-hash' as never)
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
    expect(Array.isArray(payload.error)).toBe(true)
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
      data: { passwordHash: 'new-hash' },
    })
    expect(mockPrisma.passwordResetTokens.delete).toHaveBeenCalledWith({
      where: { id: 'token-2' },
    })
  })
})
