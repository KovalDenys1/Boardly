/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma SQL objects are intentionally inspected loosely here.

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/leaderboard/route'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { api: {} },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildRequest(url = 'http://localhost:3000/api/leaderboard') {
  return new NextRequest(url)
}

describe('GET /api/leaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        rank: 1,
        userId: 'user-1',
        username: 'Player One',
        publicProfileId: 'public-1',
        gamesPlayed: BigInt(12),
        wins: BigInt(5),
        losses: BigInt(7),
        winRate: 41.7,
        avatarUrl: null,
        image: null,
        premiumUntil: null,
      },
    ] as any)
  })

  it('returns leaderboard entries and falls back to terminal metadata for winner counts', async () => {
    const response = await GET(buildRequest())
    const payload = await response.json()
    const sql = mockPrisma.$queryRaw.mock.calls[0][0].strings.join('')

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      entries: [
        {
          rank: 1,
          userId: 'user-1',
          username: 'Player One',
          publicProfileId: 'public-1',
          gamesPlayed: 12,
          wins: 5,
          losses: 7,
          winRate: 41.7,
          avatarUrl: null,
          isPremium: false,
        },
      ],
      hasMore: false,
    })
    expect(sql).toContain('terminalMetadata')
    expect(sql).toContain("result->>'userId' = p.\"userId\"")
    expect(sql).toContain("result->>'isWinner' = 'true'")
  })

  it('caches for a short window only, so profile changes (username, etc.) show up quickly (#638)', async () => {
    const response = await GET(buildRequest())

    // Was s-maxage=300/stale-while-revalidate=600 — let a stale username/avatar
    // linger on the leaderboard for up to ~15 minutes despite a live DB query.
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=20, stale-while-revalidate=60')
  })
})
