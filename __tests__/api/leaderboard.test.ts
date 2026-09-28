/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma SQL objects are intentionally inspected loosely here.

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/leaderboard/route'
import { prisma } from '@/lib/db'
import { getOptionalViewerId } from '@/lib/session-user'

jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    friendships: { findMany: jest.fn() },
  },
}))

jest.mock('@/lib/session-user', () => ({
  getOptionalViewerId: jest.fn(),
}))

// unstable_cache needs Next's incremental cache, which jest does not have;
// the test covers the query, not the caching.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
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
const mockViewerId = getOptionalViewerId as jest.Mock

function buildRequest(url = 'http://localhost:3000/api/leaderboard') {
  return new NextRequest(url)
}

describe('GET /api/leaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockViewerId.mockResolvedValue(null)
    mockPrisma.friendships.findMany.mockResolvedValue([])
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
        profileVisibility: 'public',
        premiumUntil: null,
      },
    ] as any)
  })

  it('returns leaderboard entries and falls back to terminal metadata for winner counts', async () => {
    const response = await GET(buildRequest())
    const payload = await response.json()
    const sql = mockPrisma.$queryRaw.mock.calls[0][0].strings.join('')
    // #1234: the owner's test account never ranks publicly
    expect(sql).toContain('u.id NOT IN (')
    expect(mockPrisma.$queryRaw.mock.calls[0][0].values).toContain('cmiz488060000isil2lgf6jzk')

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      entries: [
        {
          rank: 1,
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

  it('is never kept by a shared cache, because the premium badges in it depend on who asks (#1226)', async () => {
    const response = await GET(buildRequest())

    // Was `public, s-maxage=20` (#638): a CDN keyed on the URL would hand a friend's
    // view of a friends-only player's badge to the next visitor.
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it("answers for the signed-in viewer: a hidden profile keeps its picture, loses its badge, and no row carries the user id", async () => {
    mockViewerId.mockResolvedValue('viewer-1')
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        userId: 'user-private',
        username: 'Hidden Player',
        publicProfileId: 'public-2',
        gamesPlayed: BigInt(12),
        wins: BigInt(9),
        losses: BigInt(3),
        winRate: 75,
        avatarUrl: 'https://cdn.example/private-avatar.png',
        image: null,
        profileVisibility: 'private',
        premiumUntil: new Date('2099-01-01T00:00:00Z'),
      },
    ] as any)

    const response = await GET(buildRequest())
    const text = await response.text()
    const payload = JSON.parse(text)

    expect(mockViewerId).toHaveBeenCalled()
    expect(payload.entries[0]).toMatchObject({
      username: 'Hidden Player',
      wins: 9,
      losses: 3,
      avatarUrl: 'https://cdn.example/private-avatar.png',
      isPremium: false,
    })
    expect(text).not.toContain('profileVisibility')
    // The internal id opens the player card and reports by id; no row carries it.
    expect(text).not.toContain('user-private')
  })
})
