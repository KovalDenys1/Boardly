/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/resend-verification/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { sendVerificationEmail } from '@/lib/email'
import { nanoid } from 'nanoid'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findFirst: jest.fn(),
    },
    emailVerificationTokens: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
}))

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-verification-token'),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
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
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockSendVerificationEmail = sendVerificationEmail as jest.MockedFunction<typeof sendVerificationEmail>
const mockNanoid = nanoid as jest.MockedFunction<typeof nanoid>

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(null as any)
  })

  it('returns 400 when email is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Email is required')
  })

  it('returns generic success when user does not exist', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null as any)

    const request = new NextRequest('http://localhost:3000/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'missing@example.com' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.message).toContain('If an unverified account exists')
    expect(mockPrisma.emailVerificationTokens.create).not.toHaveBeenCalled()
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('returns generic success when user is already verified', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'verified@example.com',
      emailVerified: new Date('2026-01-01T00:00:00.000Z'),
      username: 'verified-user',
    } as any)

    const request = new NextRequest('http://localhost:3000/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'verified@example.com' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.message).toContain('If an unverified account exists')
    expect(mockPrisma.emailVerificationTokens.create).not.toHaveBeenCalled()
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('creates token and sends email for unverified users', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-2',
      email: 'pending@example.com',
      emailVerified: null,
      username: 'pending-user',
    } as any)
    mockPrisma.emailVerificationTokens.deleteMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.emailVerificationTokens.create.mockResolvedValue({ id: 'token-1' } as any)

    const request = new NextRequest('http://localhost:3000/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'pending@example.com' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(mockNanoid).toHaveBeenCalledWith(32)
    expect(mockPrisma.emailVerificationTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-2',
          token: 'mock-verification-token',
        }),
      })
    )
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(
      'pending@example.com',
      'mock-verification-token',
      'pending-user'
    )
  })

  it('returns generic success when verification email dispatch fails', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-3',
      email: 'pending2@example.com',
      emailVerified: null,
      username: 'pending-user-2',
    } as any)
    mockPrisma.emailVerificationTokens.deleteMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.emailVerificationTokens.create.mockResolvedValue({ id: 'token-2' } as any)
    mockSendVerificationEmail.mockRejectedValueOnce(new Error('mail provider unavailable'))

    const request = new NextRequest('http://localhost:3000/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'pending2@example.com' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      success: true,
      message: 'If an unverified account exists for this email, a verification message was sent.',
    })
    expect(mockPrisma.emailVerificationTokens.create).toHaveBeenCalled()
    expect(mockSendVerificationEmail).toHaveBeenCalled()
  })
})
