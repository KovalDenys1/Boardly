/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/forgot-password/route'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findFirst: jest.fn(),
    },
    passwordResetTokens: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/email', () => ({
  sendPasswordResetEmail: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendPasswordResetEmail = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/forgot-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const genericSuccessMessage =
  'If an account exists with that email, you will receive password reset instructions.'

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendPasswordResetEmail.mockResolvedValue({ success: true })
  })

  it('returns validation error for invalid email input', async () => {
    const response = await POST(buildRequest({ email: 'bad-email' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Invalid email address')
  })

  it('returns generic success for non-existent users to prevent enumeration', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null)

    const response = await POST(buildRequest({ email: 'missing@example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
    expect(mockPrisma.passwordResetTokens.create).not.toHaveBeenCalled()
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('returns generic success when the initial DB lookup fails', async () => {
    mockPrisma.users.findFirst.mockRejectedValue(new Error('db offline'))

    const response = await POST(buildRequest({ email: 'user@example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
  })

  it('creates a new reset token and sends email for existing users', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    } as any)

    const response = await POST(buildRequest({ email: 'USER@example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
    expect(mockPrisma.passwordResetTokens.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
    expect(mockPrisma.passwordResetTokens.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        token: expect.any(String),
        expires: expect.any(Date),
      },
    })
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('user@example.com', expect.any(String))
  })

  it('still returns generic success when sending the reset email fails', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    } as any)
    mockSendPasswordResetEmail.mockResolvedValue({
      success: false,
      error: 'provider unavailable',
    })

    const response = await POST(buildRequest({ email: 'user@example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
  })
})
