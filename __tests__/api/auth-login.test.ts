/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks intentionally stay lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/login/route'
import { prisma } from '@/lib/db'
import { comparePassword, createToken } from '@/lib/auth'

let mockRateLimitResult: Response | null = null

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  comparePassword: jest.fn(),
  createToken: jest.fn(() => 'mock.jwt.token'),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(mockRateLimitResult))),
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
  logger: {
    error: jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockComparePassword = comparePassword as jest.MockedFunction<typeof comparePassword>
const mockCreateToken = createToken as jest.MockedFunction<typeof createToken>

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRateLimitResult = null
  })

  it('returns 401 for suspended user with valid password', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      passwordHash: 'hashed-password',
      suspended: true,
    } as any)
    mockComparePassword.mockResolvedValue(true)

    const response = await POST(
      buildRequest({
        email: 'user@example.com',
        password: 'ValidPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Account suspended')
    expect(mockCreateToken).not.toHaveBeenCalled()
  })

  it('returns 401 for invalid password', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      passwordHash: 'hashed-password',
      suspended: false,
    } as any)
    mockComparePassword.mockResolvedValue(false)

    const response = await POST(
      buildRequest({
        email: 'user@example.com',
        password: 'WrongPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Invalid credentials')
    expect(mockCreateToken).not.toHaveBeenCalled()
  })

  it('normalizes email casing before querying and creating the token', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-3',
      email: 'mixed@example.com',
      username: 'mixed-user',
      passwordHash: 'hashed-password',
      suspended: false,
    } as any)
    mockComparePassword.mockResolvedValue(true)

    const response = await POST(
      buildRequest({
        email: 'MiXeD@Example.com',
        password: 'ValidPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.user.email).toBe('mixed@example.com')
    expect(mockPrisma.users.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'mixed@example.com',
          mode: 'insensitive',
        },
      },
    })
    expect(mockCreateToken).toHaveBeenCalledWith({
      userId: 'user-3',
      email: 'mixed@example.com',
    })
  })

  it('returns the limiter response when auth rate limiting triggers', async () => {
    mockRateLimitResult = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(
      buildRequest({
        email: 'user@example.com',
        password: 'ValidPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(payload.error).toBe('Too many requests')
    expect(mockPrisma.users.findFirst).not.toHaveBeenCalled()
  })

  it('returns 200 and token for active user with valid password', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-2',
      email: 'active@example.com',
      username: 'active-user',
      passwordHash: 'hashed-password',
      suspended: false,
    } as any)
    mockComparePassword.mockResolvedValue(true)

    const response = await POST(
      buildRequest({
        email: 'active@example.com',
        password: 'ValidPass123!',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      user: {
        id: 'user-2',
        email: 'active@example.com',
        username: 'active-user',
      },
      token: 'mock.jwt.token',
    })
    expect(mockCreateToken).toHaveBeenCalledWith({
      userId: 'user-2',
      email: 'active@example.com',
    })
  })
})
