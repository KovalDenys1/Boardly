/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are intentionally lightweight for route tests.

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/users/[userId]/card/route'
import { rateLimitPresets } from '@/lib/rate-limit'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn() },
    friendships: { findFirst: jest.fn() },
    friendRequests: { findFirst: jest.fn() },
  },
}))

jest.mock('@/lib/session-user', () => ({
  optionalSessionUser: jest.fn(async () => ({ session: null })),
}))

jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function cardRequest(userId: string) {
  return new NextRequest(`http://localhost:3000/api/users/${userId}/card`, {
    headers: { 'x-real-ip': '203.0.113.77' },
  })
}

/**
 * The profile card ran a user lookup, with every finished game joined in, per call and with
 * no limiter (#1157). The id is in the path, so it is limited per IP across every user id.
 */
describe('GET /api/users/[userId]/card rate limit', () => {
  const saved = { ...process.env }

  beforeEach(() => {
    // No shared store: the limiter counts in memory, which is what this test reads.
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    mockPrisma.users.findUnique.mockReset()
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'u',
      username: 'Ann',
      image: null,
      avatarUrl: null,
      publicProfileId: null,
      isGuest: true,
      premiumUntil: null,
      bot: null,
      players: [],
    })
  })

  afterAll(() => {
    process.env = saved
  })

  it('answers 429 past 60 cards a minute from one address, whichever users they are', async () => {
    expect(rateLimitPresets.userCard).toMatchObject({ maxRequests: 60, keyScope: 'user-card' })

    for (let i = 0; i < 60; i += 1) {
      const response = await GET(cardRequest(`user-${i}`), { params: Promise.resolve({ userId: `user-${i}` }) })
      expect(response.status).toBe(200)
    }

    const refused = await GET(cardRequest('user-60'), { params: Promise.resolve({ userId: 'user-60' }) })
    expect(refused.status).toBe(429)
    // Refused before the lookup, which is the expensive part.
    expect(mockPrisma.users.findUnique).toHaveBeenCalledTimes(60)
  })
})
