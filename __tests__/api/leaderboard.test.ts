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
        winRate: 41.7,
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
          winRate: 41.7,
        },
      ],
      hasMore: false,
    })
    expect(sql).toContain('terminalMetadata')
    expect(sql).toContain("result->>'userId' = p.\"userId\"")
    expect(sql).toContain("result->>'isWinner' = 'true'")
  })
})
