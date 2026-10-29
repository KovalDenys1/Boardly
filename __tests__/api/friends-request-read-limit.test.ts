/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/friends/request/route'

// Each preset gets its own limiter, so the test can exhaust one and see which one a handler answers to.
const exhausted = new Set<string>()

jest.mock('@/lib/rate-limit', () => {
  const { NextResponse } = jest.requireActual('next/server')
  const rateLimitPresets = {
    api: { name: 'api' },
    friendRequest: { name: 'friendRequest' },
  }
  return {
    rateLimitPresets,
    rateLimit: jest.fn((config: { name: string }) =>
      jest.fn(async () =>
        exhausted.has(config.name) ? NextResponse.json({ error: 'Too many' }, { status: 429 }) : null
      )
    ),
  }
})

jest.mock('@/lib/db', () => ({
  prisma: {
    friendRequests: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

jest.mock('@/lib/in-app-notifications', () => ({
  createInAppNotification: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/lib/push-send', () => ({
  sendPushNotification: jest.fn(() => Promise.resolve()),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('GET /api/friends/request and the sending limit', () => {
  beforeEach(() => {
    exhausted.clear()
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1', emailVerified: new Date('2026-01-01T00:00:00.000Z') },
    } as any)
    mockPrisma.friendRequests.findMany.mockResolvedValue([] as any)
  })

  it('still lists requests after the hourly budget for sending them is spent', async () => {
    exhausted.add('friendRequest')

    const response = await GET(
      new NextRequest('http://localhost:3000/api/friends/request?type=received')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ requests: [] })
  })

  it('is limited by the general API limit', async () => {
    exhausted.add('api')

    const response = await GET(
      new NextRequest('http://localhost:3000/api/friends/request?type=sent')
    )

    expect(response.status).toBe(429)
  })
})
