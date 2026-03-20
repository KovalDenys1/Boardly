/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/friends/route'
import { ensureUserHasPublicProfileId } from '@/lib/public-profile.server'

jest.mock('@/lib/db', () => ({
  prisma: {
    friendships: {
      findMany: jest.fn(),
    },
    games: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/public-profile.server', () => ({
  ensureUserHasPublicProfileId: jest.fn(),
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    api: {},
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockEnsureUserHasPublicProfileId =
  ensureUserHasPublicProfileId as jest.MockedFunction<typeof ensureUserHasPublicProfileId>

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/friends')
}

function createFriendship(showOnlineStatus: boolean, publicProfileId: string | null = 'public-friend-1') {
  return {
    id: 'friendship-1',
    user1Id: 'user-1',
    user2Id: 'friend-1',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    user1: {
      id: 'user-1',
      username: 'current-user',
      image: null,
      email: 'current@example.com',
      bot: null,
      accountPreferences: {
        showOnlineStatus: true,
      },
    },
    user2: {
      id: 'friend-1',
      username: 'friend-user',
      image: null,
      email: 'friend@example.com',
      publicProfileId,
      bot: null,
      accountPreferences: {
        showOnlineStatus,
      },
    },
  }
}

describe('GET /api/friends', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEnsureUserHasPublicProfileId.mockResolvedValue('generated-public-friend')
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
        emailVerified: new Date('2026-03-01T00:00:00.000Z'),
      },
    } as any)
  })

  it('masks friend presence when showOnlineStatus is disabled', async () => {
    mockPrisma.friendships.findMany.mockResolvedValue([createFriendship(false)] as any)
    mockPrisma.games.findMany.mockResolvedValue([
      {
        status: 'playing',
        players: [{ userId: 'friend-1' }],
      },
    ] as any)

    const response = await GET(buildRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.friends).toHaveLength(1)
    expect(payload.friends[0].presence).toBe('offline')
  })

  it('returns active presence when showOnlineStatus is enabled', async () => {
    mockPrisma.friendships.findMany.mockResolvedValue([createFriendship(true)] as any)
    mockPrisma.games.findMany.mockResolvedValue([
      {
        status: 'playing',
        players: [{ userId: 'friend-1' }],
      },
    ] as any)

    const response = await GET(buildRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.friends).toHaveLength(1)
    expect(payload.friends[0].presence).toBe('in_game')
    expect(payload.friends[0].publicProfileId).toBe('public-friend-1')
  })

  it('ensures a friend has a public profile id when it is missing', async () => {
    mockPrisma.friendships.findMany.mockResolvedValue([createFriendship(true, null)] as any)
    mockPrisma.games.findMany.mockResolvedValue([] as any)

    const response = await GET(buildRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockEnsureUserHasPublicProfileId).toHaveBeenCalledWith('friend-1')
    expect(payload.friends[0].publicProfileId).toBe('generated-public-friend')
  })
})
