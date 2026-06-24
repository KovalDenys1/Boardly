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

jest.mock('@/lib/push-send', () => ({
  sendPushNotification: jest.fn(() => Promise.resolve()),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockFindUserByFriendCode = findUserByFriendCode as jest.MockedFunction<typeof findUserByFriendCode>
const mockCreateInAppNotification =
  createInAppNotification as jest.MockedFunction<typeof createInAppNotification>

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
})
