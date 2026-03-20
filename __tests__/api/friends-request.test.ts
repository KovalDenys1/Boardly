/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { POST } from '@/app/api/friends/request/route'
import { queueFriendRequestNotificationEmail } from '@/lib/friend-notification-emails'
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

jest.mock('@/lib/friend-notification-emails', () => ({
  queueFriendRequestNotificationEmail: jest.fn(() => Promise.resolve({ queued: true })),
}))

jest.mock('@/lib/in-app-notifications', () => ({
  createInAppNotification: jest.fn(() => Promise.resolve()),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockQueueFriendRequestNotificationEmail =
  queueFriendRequestNotificationEmail as jest.MockedFunction<typeof queueFriendRequestNotificationEmail>
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
    mockPrisma.friendships.findFirst.mockResolvedValue(null as any)
    mockPrisma.friendRequests.findFirst.mockResolvedValue(null as any)
    mockQueueFriendRequestNotificationEmail.mockResolvedValue({ queued: true } as any)
    mockCreateInAppNotification.mockResolvedValue(undefined)
  })

  it('rejects invalid public profile links before hitting Prisma', async () => {
    const response = await POST(buildRequest({ receiverPublicProfileId: 'invalid-id' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Invalid public profile link')
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled()
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
      },
      receiver: {
        id: 'receiver-1',
        username: 'target-user',
        email: 'target@example.com',
      },
    } as any)

    const response = await POST(buildRequest({ receiverPublicProfileId: 'AbC123xYz890' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
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
    expect(mockQueueFriendRequestNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-1',
      })
    )
    expect(mockCreateInAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'receiver-1',
        type: 'friend_request',
      })
    )
  })
})
