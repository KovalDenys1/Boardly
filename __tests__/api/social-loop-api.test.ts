/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - route tests intentionally use lightweight Prisma mocks

import { NextRequest } from 'next/server'
import { POST as SEND_INVITE } from '@/app/api/lobby/[code]/invite/route'
import { POST as REQUEST_REMATCH } from '@/app/api/lobby/[code]/rematch/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToUser } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
    },
    players: {
      findFirst: jest.fn(),
    },
    friendships: {
      findMany: jest.fn(),
    },
    lobbyInvites: {
      createMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToUser: jest.fn().mockResolvedValue(true),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/in-app-notifications', () => ({
  createInAppNotification: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/notification-preferences', () => ({
  getNotificationPreferences: jest.fn().mockResolvedValue({
    unsubscribedAll: false,
    gameInvites: true,
  }),
}))

jest.mock('@/lib/notifications-log', () => ({
  recordNotificationDelivery: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/email', () => ({
  sendGameInviteEmail: jest.fn().mockResolvedValue({ success: true }),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockBroadcastToUser = broadcastToUser as jest.MockedFunction<typeof broadcastToUser>

describe('Social loop APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBroadcastToUser.mockResolvedValue(true)
  })

  describe('POST /api/lobby/[code]/invite', () => {
    it('sends Supabase Broadcast invites only to valid friends', async () => {
      mockGetRequestAuthUser.mockResolvedValue({
        id: 'user-1',
        username: 'Host',
        isGuest: false,
      })
      mockPrisma.lobbies.findUnique.mockResolvedValue({
        id: 'lobby-1',
        code: 'ABCD',
        name: 'Lobby',
        gameType: 'yahtzee',
      } as any)
      mockPrisma.players.findFirst.mockResolvedValue({ id: 'player-1' } as any)
      mockPrisma.friendships.findMany.mockResolvedValue([
        {
          user1Id: 'user-1',
          user2Id: 'friend-1',
          user1: { id: 'user-1', username: 'Host', email: null },
          user2: { id: 'friend-1', username: 'Friend', email: null },
        },
      ] as any)
      mockPrisma.lobbyInvites.createMany.mockResolvedValue({ count: 1 } as any)

      const request = new NextRequest('http://localhost:3000/api/lobby/ABCD/invite', {
        method: 'POST',
        body: JSON.stringify({
          friendIds: ['friend-1', 'unknown-2'],
        }),
      })

      const response = await SEND_INVITE(request, { params: Promise.resolve({ code: 'ABCD' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.invitedCount).toBe(1)
      expect(data.skippedFriendIds).toEqual(['unknown-2'])
      expect(mockBroadcastToUser).toHaveBeenCalledWith(
        'friend-1',
        'lobby-invite',
        expect.objectContaining({
          lobbyCode: 'ABCD',
          invitedById: 'user-1',
        })
      )
    })

    it('rejects guest users for friend invites', async () => {
      mockGetRequestAuthUser.mockResolvedValue({
        id: 'guest-1',
        username: 'Guest',
        isGuest: true,
      })

      const request = new NextRequest('http://localhost:3000/api/lobby/ABCD/invite', {
        method: 'POST',
        body: JSON.stringify({
          friendIds: ['friend-1'],
        }),
      })

      const response = await SEND_INVITE(request, { params: Promise.resolve({ code: 'ABCD' }) })
      expect(response.status).toBe(403)
      expect(mockBroadcastToUser).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/lobby/[code]/rematch', () => {
    it('returns localized auth error when unauthenticated', async () => {
      mockGetRequestAuthUser.mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/lobby/ABCD/rematch', {
        method: 'POST',
      })

      const response = await REQUEST_REMATCH(request, {
        params: Promise.resolve({ code: 'ABCD' }),
      })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.translationKey).toBe('errors.unauthorized')
      expect(mockBroadcastToUser).not.toHaveBeenCalled()
    })

    it('notifies other participants when creator requests rematch', async () => {
      mockGetRequestAuthUser.mockResolvedValue({
        id: 'host-1',
        username: 'Host',
        isGuest: false,
      })
      mockPrisma.lobbies.findUnique.mockResolvedValue({
        code: 'ABCD',
        name: 'Lobby',
        gameType: 'yahtzee',
        creatorId: 'host-1',
        games: [
          {
            players: [{ userId: 'host-1' }, { userId: 'friend-1' }],
          },
        ],
      } as any)

      const request = new NextRequest('http://localhost:3000/api/lobby/ABCD/rematch', {
        method: 'POST',
      })
      const response = await REQUEST_REMATCH(request, {
        params: Promise.resolve({ code: 'ABCD' }),
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.notifiedCount).toBe(1)
      expect(data.notifiedUserIds).toEqual(['friend-1'])
      expect(mockBroadcastToUser).toHaveBeenCalledWith(
        'friend-1',
        'rematch-request',
        expect.objectContaining({
          lobbyCode: 'ABCD',
          requestedById: 'host-1',
        })
      )
    })

    it('rejects rematch request when user is not a game participant', async () => {
      mockGetRequestAuthUser.mockResolvedValue({
        id: 'outsider-1',
        username: 'Outsider',
        isGuest: false,
      })
      mockPrisma.lobbies.findUnique.mockResolvedValue({
        code: 'ABCD',
        name: 'Lobby',
        gameType: 'yahtzee',
        creatorId: 'host-1',
        games: [
          {
            players: [{ userId: 'host-1' }, { userId: 'friend-1' }],
          },
        ],
      } as any)

      const request = new NextRequest('http://localhost:3000/api/lobby/ABCD/rematch', {
        method: 'POST',
      })
      const response = await REQUEST_REMATCH(request, {
        params: Promise.resolve({ code: 'ABCD' }),
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.translationKey).toBe('toast.rematchNotParticipant')
      expect(mockBroadcastToUser).not.toHaveBeenCalled()
    })

    it('returns no notifications when requester is the only remaining latest-game participant', async () => {
      mockGetRequestAuthUser.mockResolvedValue({
        id: 'host-1',
        username: 'Host',
        isGuest: false,
      })
      mockPrisma.lobbies.findUnique.mockResolvedValue({
        id: 'lobby-1',
        code: 'ABCD',
        name: 'Lobby',
        gameType: 'yahtzee',
        creatorId: 'host-1',
        games: [
          {
            id: 'game-1',
            players: [{ userId: 'host-1', user: { username: 'Host', email: 'host@example.com' } }],
          },
        ],
      } as any)

      const request = new NextRequest('http://localhost:3000/api/lobby/ABCD/rematch', {
        method: 'POST',
      })
      const response = await REQUEST_REMATCH(request, {
        params: Promise.resolve({ code: 'ABCD' }),
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.notifiedCount).toBe(0)
      expect(data.notifiedUserIds).toEqual([])
      expect(mockBroadcastToUser).not.toHaveBeenCalled()
    })

    it('returns localized error when lobby has no games yet', async () => {
      mockGetRequestAuthUser.mockResolvedValue({
        id: 'host-1',
        username: 'Host',
        isGuest: false,
      })
      mockPrisma.lobbies.findUnique.mockResolvedValue({
        code: 'ABCD',
        name: 'Lobby',
        gameType: 'yahtzee',
        creatorId: 'host-1',
        games: [],
      } as any)

      const request = new NextRequest('http://localhost:3000/api/lobby/ABCD/rematch', {
        method: 'POST',
      })
      const response = await REQUEST_REMATCH(request, {
        params: Promise.resolve({ code: 'ABCD' }),
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.translationKey).toBe('toast.rematchNoCompletedGame')
      expect(mockBroadcastToUser).not.toHaveBeenCalled()
    })
  })
})
