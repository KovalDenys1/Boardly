/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { findUserByFriendCode } from '@/lib/friend-code'
import { POST } from '@/app/api/friends/add-by-code/route'
import { createInAppNotification } from '@/lib/in-app-notifications'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
    },
    friendships: {
      findFirst: jest.fn(),
    },
    friendRequests: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/friend-code', () => ({
  findUserByFriendCode: jest.fn(),
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/rate-limit', () => {
  const consumeKeyedRateLimit = jest.fn(() => Promise.resolve({ limited: false, retryAfterSeconds: 0 }))
  return {
    rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
    rateLimitPresets: {
      api: {},
      friendCodeAttempt: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
      friendCodeDailyOutgoing: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 20 },
    },
    consumeKeyedRateLimit,
    __consumeKeyedRateLimit: consumeKeyedRateLimit,
  }
})

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/in-app-notifications', () => ({
  createInAppNotification: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/lib/push-send', () => ({
  sendPushNotification: jest.fn(() => Promise.resolve()),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockFindUserByFriendCode = findUserByFriendCode as jest.MockedFunction<typeof findUserByFriendCode>
const mockCreateInAppNotification =
  createInAppNotification as jest.MockedFunction<typeof createInAppNotification>
const mockConsumeKeyedRateLimit = (
  jest.requireMock('@/lib/rate-limit') as { __consumeKeyedRateLimit: jest.Mock }
).__consumeKeyedRateLimit

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/friends/add-by-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/friends/add-by-code', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'sender-1',
        emailVerified: new Date('2026-03-01T00:00:00.000Z'),
      },
    } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'sender-1',
      username: 'sender-user',
      email: 'sender@example.com',
      bot: null,
    } as any)
    mockPrisma.friendships.findFirst.mockResolvedValue(null as any)
    mockPrisma.friendRequests.findFirst.mockResolvedValue(null as any)
    mockCreateInAppNotification.mockResolvedValue(undefined)
    mockConsumeKeyedRateLimit.mockResolvedValue({ limited: false, retryAfterSeconds: 0 })
  })

  it('resolves both the request.receiver and top-level user avatar (avatarUrl over image)', async () => {
    mockFindUserByFriendCode.mockResolvedValue({
      id: 'receiver-1',
      username: 'target-user',
      email: 'target@example.com',
      image: 'https://lh3.googleusercontent.com/oauth-photo.jpg',
      avatarUrl: 'https://cdn.example.com/custom-avatar.png',
      friendCode: '12345',
    } as any)
    mockPrisma.friendRequests.create.mockResolvedValue({
      id: 'request-1',
      receiver: {
        id: 'receiver-1',
        username: 'target-user',
        email: 'target@example.com',
        image: 'https://lh3.googleusercontent.com/oauth-photo.jpg',
        avatarUrl: 'https://cdn.example.com/custom-avatar.png',
      },
    } as any)

    const response = await POST(buildRequest({ friendCode: '12345' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.request.receiver.avatar).toBe('https://cdn.example.com/custom-avatar.png')
    expect(payload.user.avatar).toBe('https://cdn.example.com/custom-avatar.png')
  })

  it('falls back to the OAuth image when there is no custom avatarUrl', async () => {
    mockFindUserByFriendCode.mockResolvedValue({
      id: 'receiver-1',
      username: 'target-user',
      email: 'target@example.com',
      image: 'https://lh3.googleusercontent.com/oauth-photo.jpg',
      avatarUrl: null,
      friendCode: '12345',
    } as any)
    mockPrisma.friendRequests.create.mockResolvedValue({
      id: 'request-1',
      receiver: {
        id: 'receiver-1',
        username: 'target-user',
        email: 'target@example.com',
        image: 'https://lh3.googleusercontent.com/oauth-photo.jpg',
        avatarUrl: null,
      },
    } as any)

    const response = await POST(buildRequest({ friendCode: '12345' }))
    const payload = await response.json()

    expect(payload.request.receiver.avatar).toBe('https://lh3.googleusercontent.com/oauth-photo.jpg')
    expect(payload.user.avatar).toBe('https://lh3.googleusercontent.com/oauth-photo.jpg')
  })

  // #1226: knowing someone's friend code is not permission to see their profile. The
  // sender is not a friend yet (checked before the request is made), so the picture and
  // internal id come back only for a public profile.
  describe('profile visibility (#1226)', () => {
    const AVATAR = 'https://cdn.example.com/target-avatar.png'

    function target(profileVisibility: 'public' | 'friends' | 'private' | null) {
      const accountPreferences = profileVisibility ? { profileVisibility } : null
      mockFindUserByFriendCode.mockResolvedValue({
        id: 'receiver-cuid-1',
        username: 'target-user',
        image: null,
        avatarUrl: AVATAR,
        friendCode: '12345',
        accountPreferences,
      } as any)
      mockPrisma.friendRequests.create.mockResolvedValue({
        id: 'request-1',
        senderId: 'sender-1',
        receiverId: 'receiver-cuid-1',
        status: 'pending',
        receiver: { id: 'receiver-cuid-1', username: 'target-user', image: null, avatarUrl: AVATAR, accountPreferences },
      } as any)
    }

    async function send() {
      const response = await POST(buildRequest({ friendCode: '12345' }))
      expect(response.status).toBe(200)
      const text = await response.text()
      return { payload: JSON.parse(text), text }
    }

    it.each(['public', null] as const)('a %s profile answers with its picture and id', async (visibility) => {
      target(visibility)

      const { payload, text } = await send()

      expect(payload.request.receiver).toMatchObject({ id: 'receiver-cuid-1', username: 'target-user', avatar: AVATAR })
      expect(payload.request.receiverId).toBe('receiver-cuid-1')
      expect(payload.user).toMatchObject({ id: 'receiver-cuid-1', username: 'target-user', avatar: AVATAR })
      expect(text).not.toContain('profileVisibility')
    })

    it.each(['friends', 'private'] as const)(
      'a %s profile answers with the username alone: no picture, no internal id',
      async (visibility) => {
        target(visibility)

        const { payload, text } = await send()

        expect(payload.request.receiver).toEqual({ username: 'target-user', avatar: null })
        expect(payload.request.receiverId).toBeUndefined()
        expect(payload.user).toEqual({ username: 'target-user', avatar: null })
        expect(text).not.toContain(AVATAR)
        expect(text).not.toContain('receiver-cuid-1')
        expect(text).not.toContain('profileVisibility')
        // The request itself still goes to the right person.
        expect(mockPrisma.friendRequests.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: { senderId: 'sender-1', receiverId: 'receiver-cuid-1', status: 'pending' } })
        )
      }
    )
  })

  // #1120 (audit S2-05)
  it('returns 400, not 404, for a well-formed code assigned to nobody', async () => {
    mockFindUserByFriendCode.mockResolvedValue(null as any)

    const response = await POST(buildRequest({ friendCode: '99999' }))

    expect(response.status).toBe(400)
  })

  it('returns 429 when the per-user attempt limit is exceeded, keyed on the sender', async () => {
    mockConsumeKeyedRateLimit.mockImplementation((key: string) =>
      Promise.resolve(
        key.startsWith('friend-code-attempt:')
          ? { limited: true, retryAfterSeconds: 1800 }
          : { limited: false, retryAfterSeconds: 0 }
      )
    )

    const response = await POST(buildRequest({ friendCode: '12345' }))

    expect(response.status).toBe(429)
    expect(mockFindUserByFriendCode).not.toHaveBeenCalled()
    expect(mockConsumeKeyedRateLimit).toHaveBeenCalledWith(
      'friend-code-attempt:sender-1',
      expect.anything()
    )
  })

  it('returns 429 when the daily outgoing cap is exceeded, without creating the request', async () => {
    mockFindUserByFriendCode.mockResolvedValue({
      id: 'receiver-1',
      username: 'target-user',
      email: 'target@example.com',
      image: null,
      avatarUrl: null,
      friendCode: '12345',
    } as any)
    mockConsumeKeyedRateLimit.mockImplementation((key: string) =>
      Promise.resolve(
        key.startsWith('friend-code-outgoing:')
          ? { limited: true, retryAfterSeconds: 3600 }
          : { limited: false, retryAfterSeconds: 0 }
      )
    )

    const response = await POST(buildRequest({ friendCode: '12345' }))

    expect(response.status).toBe(429)
    expect(mockPrisma.friendRequests.create).not.toHaveBeenCalled()
  })
})
