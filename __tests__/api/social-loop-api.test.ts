/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - route tests intentionally use lightweight Prisma mocks

import { NextRequest } from 'next/server'
import { POST as SEND_INVITE } from '@/app/api/lobby/[code]/invite/route'
import { POST as REQUEST_REMATCH } from '@/app/api/lobby/[code]/rematch/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { notifySocket } from '@/lib/socket-url'
import { SocketEvents } from '@/types/socket-events'

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

jest.mock('@/lib/socket-url', () => ({
  notifySocket: jest.fn().mockResolvedValue(true),
}))

jest.mock('@/lib/email', () => ({
  sendSocialInviteEmail: jest.fn().mockResolvedValue({ success: true }),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockNotifySocket = notifySocket as jest.MockedFunction<typeof notifySocket>

describe('Social loop APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/lobby/[code]/invite', () => {
    it('sends socket invites only to valid friends', async () => {
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
          user1: { id: 'user-1', username: 'Host' },
          user2: { id: 'friend-1', username: 'Friend' },
        },
      ] as any)

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
      expect(mockNotifySocket).toHaveBeenCalledWith(
        'user:friend-1',
        SocketEvents.LOBBY_INVITE,
        expect.objectContaining({
          lobbyCode: 'ABCD',
          invitedById: 'user-1',
        }),
        0
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
      expect(mockNotifySocket).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/lobby/[code]/rematch', () => {
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
      expect(mockNotifySocket).toHaveBeenCalledWith(
        'user:friend-1',
        SocketEvents.REMATCH_REQUEST,
        expect.objectContaining({
          lobbyCode: 'ABCD',
          requestedById: 'host-1',
        }),
        0
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

      expect(response.status).toBe(403)
      expect(mockNotifySocket).not.toHaveBeenCalled()
    })
  })
})
