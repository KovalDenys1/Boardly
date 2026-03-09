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
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    emailVerificationTokens: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn(),
  createToken: jest.fn(),
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
    mockPrisma.users.findFirst.mockResolvedValue(null)
    mockPrisma.users.findUnique.mockResolvedValue(null)
    mockPrisma.users.create.mockResolvedValue({
      id: 'user-1',
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
    expect(mockPrisma.users.findFirst).not.toHaveBeenCalled()
  })

  it('rejects duplicate email or username during initial lookup', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({ id: 'existing-user' } as any)

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

  it('rejects a username collision found before user creation', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({ id: 'taken-user' } as any)

    const response = await POST(
      buildRequest({
        email: 'new@example.com',
        username: 'new_user',
        password: 'ValidPass123',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Username already taken')
    expect(mockPrisma.users.create).not.toHaveBeenCalled()
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
    expect(mockPrisma.users.findFirst).not.toHaveBeenCalled()
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
    expect(mockPrisma.users.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            email: {
              equals: 'new@example.com',
              mode: 'insensitive',
            },
          },
          { username: 'new_user' },
        ],
      },
    })
    expect(mockPrisma.users.create).toHaveBeenCalledWith({
      data: {
        email: 'new@example.com',
        username: 'new_user',
        passwordHash: 'hashed-password',
      },
    })
    expect(mockPrisma.emailVerificationTokens.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        token: 'verification-token',
        expires: expect.any(Date),
      },
    })
    expect(mockSendVerificationEmail).toHaveBeenCalledWith('new@example.com', 'verification-token')
    expect(payload.user).toEqual({
      id: 'user-1',
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
