/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { GET, POST } from '@/app/api/friends/request/route'
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
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
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

jest.mock('@/lib/in-app-notifications', () => ({
  createInAppNotification: jest.fn(() => Promise.resolve()),
}))

// The route fires `void sendPushNotification(...)` — unmocked, the real
// module hits the partial prisma mock after the test ends, and the
// resulting unhandled rejection sends Next's unhandled-rejection extension
// into infinite setImmediate recursion (the #758 full-suite OOM).
jest.mock('@/lib/push-send', () => ({
  sendPushNotification: jest.fn(() => Promise.resolve()),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCreateInAppNotification =
  createInAppNotification as jest.MockedFunction<typeof createInAppNotification>

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/friends/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/friends/request', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'sender-1',
        emailVerified: new Date('2026-03-01T00:00:00.000Z'),
      },
    } as any)
    // lib/session-user re-reads the caller's `suspended` flag on a write (#1137).
    mockPrisma.users.findUnique.mockResolvedValue({ suspended: false } as any)
    mockPrisma.friendships.findFirst.mockResolvedValue(null as any)
    mockPrisma.friendRequests.findFirst.mockResolvedValue(null as any)
    mockCreateInAppNotification.mockResolvedValue(undefined)
  })

  // #1137: the token still says active, the database says suspended.
  it('refuses a suspended sender on the next request', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({ suspended: true } as any)

    const response = await POST(buildRequest({ receiverPublicProfileId: 'invalid-id' }))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.code).toBe('ACCOUNT_SUSPENDED')
    expect(mockPrisma.friendRequests.findFirst).not.toHaveBeenCalled()
  })

  it('rejects invalid public profile links before hitting Prisma', async () => {
    const response = await POST(buildRequest({ receiverPublicProfileId: 'invalid-id' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Invalid public profile link')
    // Only the caller's own suspension re-read; the receiver is never looked up.
    expect(mockPrisma.users.findUnique).toHaveBeenCalledTimes(1)
    expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
      where: { id: 'sender-1' },
      select: { suspended: true },
    })
  })

  it('creates a friend request when receiverPublicProfileId is provided', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'receiver-1',
      username: 'target-user',
      bot: null,
      isGuest: false,
    } as any)
    mockPrisma.friendRequests.create.mockResolvedValue({
      id: 'request-1',
      sender: {
        id: 'sender-1',
        username: 'sender-user',
        email: 'sender@example.com',
        image: 'https://lh3.googleusercontent.com/oauth-photo.jpg',
        avatarUrl: 'https://cdn.example.com/custom-avatar.png',
      },
      receiver: {
        id: 'receiver-1',
        username: 'target-user',
        email: 'target@example.com',
        image: null,
        avatarUrl: null,
      },
    } as any)

    const response = await POST(buildRequest({ receiverPublicProfileId: 'AbC123xYz890' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.friendRequest.sender.avatar).toBe('https://cdn.example.com/custom-avatar.png')
    expect(payload.friendRequest.receiver.avatar).toBeNull()
    expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
      where: { publicProfileId: 'AbC123xYz890' },
      select: { id: true, username: true, bot: true, isGuest: true },
    })
    expect(mockPrisma.friendRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          senderId: 'sender-1',
          receiverId: 'receiver-1',
          status: 'pending',
        },
      })
    )
    expect(mockCreateInAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'receiver-1',
        type: 'friend_request',
      })
    )
  })

  // #1226: the sender is not a friend yet, so a hidden receiver's internal id stays out
  // of the answer. The username and picture are public (Denys, 2026-09-27 20:32).
  it.each(['private', 'friends'] as const)(
    "answers a %s receiver's username and picture, not their internal id",
    async (profileVisibility) => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'receiver-hidden-1',
        username: 'hidden-user',
        bot: null,
        isGuest: false,
      } as any)
      mockPrisma.friendRequests.create.mockResolvedValue({
        id: 'request-2',
        senderId: 'sender-1',
        receiverId: 'receiver-hidden-1',
        status: 'pending',
        sender: { id: 'sender-1', username: 'sender-user', image: null, avatarUrl: null },
        receiver: {
          id: 'receiver-hidden-1',
          username: 'hidden-user',
          image: null,
          avatarUrl: 'https://cdn.example.com/hidden-avatar.png',
          accountPreferences: { profileVisibility },
        },
      } as any)

      const response = await POST(buildRequest({ receiverUsername: 'hidden-user' }))
      const text = await response.text()
      const payload = JSON.parse(text)

      expect(response.status).toBe(200)
      expect(payload.friendRequest.receiver).toEqual({
        username: 'hidden-user',
        avatar: 'https://cdn.example.com/hidden-avatar.png',
      })
      expect(payload.friendRequest.receiverId).toBeUndefined()
      expect(text).not.toContain('receiver-hidden-1')
      expect(text).not.toContain('profileVisibility')
      // The request itself still goes to the right person.
      expect(mockPrisma.friendRequests.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { senderId: 'sender-1', receiverId: 'receiver-hidden-1', status: 'pending' } })
      )
    }
  )
})

function buildGetRequest(type: string) {
  return new NextRequest(`http://localhost:3000/api/friends/request?type=${type}`)
}

describe('GET /api/friends/request', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
        emailVerified: new Date('2026-03-01T00:00:00.000Z'),
      },
    } as any)
  })

  it('resolves sender/receiver avatar (custom avatarUrl over OAuth image), never leaving it undefined', async () => {
    mockPrisma.friendRequests.findMany.mockResolvedValue([
      {
        id: 'request-1',
        senderId: 'sender-1',
        receiverId: 'user-1',
        status: 'pending',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        sender: {
          id: 'sender-1',
          username: 'sender-user',
          image: 'https://lh3.googleusercontent.com/oauth-photo.jpg',
          avatarUrl: 'https://cdn.example.com/custom-avatar.png',
          email: 'sender@example.com',
        },
        receiver: {
          id: 'user-1',
          username: 'me',
          image: null,
          avatarUrl: null,
          email: 'me@example.com',
        },
      },
    ] as any)

    const response = await GET(buildGetRequest('received'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.requests[0].sender.avatar).toBe('https://cdn.example.com/custom-avatar.png')
    expect(payload.requests[0].receiver.avatar).toBeNull()
  })

  // #1226: in the requests you sent, a receiver whose profile you may not see keeps
  // their internal id to themselves; the username and picture are public.
  it("keeps a hidden receiver's internal id out of the requests you sent", async () => {
    const sent = (id: string, profileVisibility: string | null) => ({
      id: `request-${id}`,
      senderId: 'user-1',
      receiverId: id,
      status: 'pending',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      sender: { id: 'user-1', username: 'me', image: null, avatarUrl: null },
      receiver: {
        id,
        username: `name-${id}`,
        image: null,
        avatarUrl: `https://cdn.example.com/${id}.png`,
        accountPreferences: profileVisibility ? { profileVisibility } : null,
      },
    })
    mockPrisma.friendRequests.findMany.mockResolvedValue([
      sent('rcv-public', 'public'),
      sent('rcv-legacy', null),
      sent('rcv-friends', 'friends'),
      sent('rcv-private', 'private'),
    ] as any)

    const response = await GET(buildGetRequest('sent'))
    const text = await response.text()
    const { requests } = JSON.parse(text)

    expect(requests.map((r: any) => r.receiver)).toEqual([
      { id: 'rcv-public', username: 'name-rcv-public', image: null, avatarUrl: 'https://cdn.example.com/rcv-public.png', avatar: 'https://cdn.example.com/rcv-public.png' },
      { id: 'rcv-legacy', username: 'name-rcv-legacy', image: null, avatarUrl: 'https://cdn.example.com/rcv-legacy.png', avatar: 'https://cdn.example.com/rcv-legacy.png' },
      { username: 'name-rcv-friends', avatar: 'https://cdn.example.com/rcv-friends.png' },
      { username: 'name-rcv-private', avatar: 'https://cdn.example.com/rcv-private.png' },
    ])
    expect(requests.map((r: any) => r.receiverId)).toEqual(['rcv-public', 'rcv-legacy', undefined, undefined])
    for (const hidden of ['rcv-friends', 'rcv-private']) {
      expect(text).not.toContain(`"${hidden}"`)
    }
    expect(text).not.toContain('profileVisibility')
  })
})
