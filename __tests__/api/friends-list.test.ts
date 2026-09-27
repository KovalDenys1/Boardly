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

  it('does not ask Prisma for the friend\'s email address', async () => {
    // The response spreads whatever the select returned, so the select is the
    // guard. Addresses leaked from here until 2026-09-03 because email was in
    // it. Assert on the query rather than the body: the mock cannot prove a
    // field is absent that the real select no longer requests.
    mockPrisma.friendships.findMany.mockResolvedValue([] as any)
    mockPrisma.games.findMany.mockResolvedValue([] as any)

    await GET(buildRequest())

    const select = JSON.stringify(mockPrisma.friendships.findMany.mock.calls[0][0])
    expect(select).not.toContain('"email"')
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

  it('prefers the custom-uploaded avatarUrl over the OAuth image, and never leaves avatar undefined', async () => {
    const friendship = createFriendship(true)
    friendship.user2.avatarUrl = 'https://cdn.example.com/custom-avatar.png'
    friendship.user2.image = 'https://lh3.googleusercontent.com/oauth-photo.jpg'
    mockPrisma.friendships.findMany.mockResolvedValue([friendship] as any)
    mockPrisma.games.findMany.mockResolvedValue([] as any)

    const response = await GET(buildRequest())
    const payload = await response.json()

    expect(payload.friends[0].avatar).toBe('https://cdn.example.com/custom-avatar.png')
  })

  it('falls back to the OAuth image when there is no custom avatarUrl', async () => {
    const friendship = createFriendship(true)
    friendship.user2.avatarUrl = null
    friendship.user2.image = 'https://lh3.googleusercontent.com/oauth-photo.jpg'
    mockPrisma.friendships.findMany.mockResolvedValue([friendship] as any)
    mockPrisma.games.findMany.mockResolvedValue([] as any)

    const response = await GET(buildRequest())
    const payload = await response.json()

    expect(payload.friends[0].avatar).toBe('https://lh3.googleusercontent.com/oauth-photo.jpg')
  })

  // #1226: the name and picture are public (Denys, 2026-09-27 20:32). Premium status and
  // online status are profile content, and private means nobody but the owner, friends
  // included. Public and friends-only profiles are visible to a friend.
  describe('profile visibility (#1226)', () => {
    const AVATAR = 'https://cdn.example.com/friend-avatar.png'

    async function friendWith(profileVisibility: 'public' | 'friends' | 'private' | undefined) {
      const friendship = createFriendship(true)
      friendship.user2.avatarUrl = AVATAR
      friendship.user2.premiumUntil = new Date('2099-01-01T00:00:00Z')
      friendship.user2.accountPreferences = profileVisibility
        ? { showOnlineStatus: true, profileVisibility }
        : null
      mockPrisma.friendships.findMany.mockResolvedValue([friendship] as any)
      // In a game right now, with online status switched on.
      mockPrisma.games.findMany.mockResolvedValue([{ status: 'playing', players: [{ userId: 'friend-1' }] }] as any)

      const response = await GET(buildRequest())
      expect(response.status).toBe(200)
      const text = await response.text()
      return { friend: JSON.parse(text).friends[0], text }
    }

    it('asks for the visibility of both sides of the friendship', async () => {
      mockPrisma.friendships.findMany.mockResolvedValue([] as any)
      mockPrisma.games.findMany.mockResolvedValue([] as any)

      await GET(buildRequest())

      const { include } = mockPrisma.friendships.findMany.mock.calls[0][0]
      expect(include.user1.select.accountPreferences.select.profileVisibility).toBe(true)
      expect(include.user2.select.accountPreferences.select.profileVisibility).toBe(true)
    })

    it.each([
      ['public', 'public'],
      ['friends-only', 'friends'],
      ['legacy (no preferences row)', undefined],
    ] as const)(
      'a %s friend is listed with their picture, premium badge and presence',
      async (_label, visibility) => {
        const { friend } = await friendWith(visibility)

        expect(friend).toMatchObject({ username: 'friend-user', avatar: AVATAR, isPremium: true, presence: 'in_game' })
      }
    )

    it('a private friend is listed with name and picture, but no premium badge and as offline', async () => {
      const { friend, text } = await friendWith('private')

      expect(friend).toMatchObject({ username: 'friend-user', avatar: AVATAR, isPremium: false, presence: 'offline' })
      expect(text).not.toContain('profileVisibility')
      expect(text).not.toContain('premiumUntil')
    })
  })
})
