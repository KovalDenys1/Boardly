/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level Prisma transaction mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST } from '@/app/api/user/upgrade-guest/route'
import { prisma } from '@/lib/db'
import { getGuestClaimsFromRequest } from '@/lib/guest-auth'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

const mockTx = {
  users: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  players: {
    findMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
  lobbies: {
    updateMany: jest.fn(),
  },
  lobbyInvites: {
    updateMany: jest.fn(),
  },
  notifications: {
    updateMany: jest.fn(),
  },
  notificationPreferences: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/guest-auth', () => ({
  getGuestClaimsFromRequest: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetGuestClaimsFromRequest = getGuestClaimsFromRequest as jest.MockedFunction<
  typeof getGuestClaimsFromRequest
>

describe('POST /api/user/upgrade-guest', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockTx as any))

    mockTx.users.findUnique.mockReset()
    mockTx.users.delete.mockReset()
    mockTx.players.findMany.mockReset()
    mockTx.players.update.mockReset()
    mockTx.players.deleteMany.mockReset()
    mockTx.players.updateMany.mockReset()
    mockTx.lobbies.updateMany.mockReset()
    mockTx.lobbyInvites.updateMany.mockReset()
    mockTx.notifications.updateMany.mockReset()
    mockTx.notificationPreferences.findUnique.mockReset()
    mockTx.notificationPreferences.update.mockReset()
    mockTx.notificationPreferences.delete.mockReset()
  })

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null as any)

    const request = new NextRequest('http://localhost:3000/api/user/upgrade-guest', {
      method: 'POST',
      headers: {
        'X-Guest-Token': 'guest.token',
      },
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized')
  })

  it('returns 400 when guest token is invalid or missing', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    } as any)
    mockGetGuestClaimsFromRequest.mockReturnValue(null)

    const request = new NextRequest('http://localhost:3000/api/user/upgrade-guest', {
      method: 'POST',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Missing or invalid guest token')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns idempotent success when guest account is already migrated', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    } as any)
    mockGetGuestClaimsFromRequest.mockReturnValue({
      guestId: 'guest-1',
      guestName: 'Guest One',
    } as any)
    mockTx.users.findUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/user/upgrade-guest', {
      method: 'POST',
      headers: {
        'X-Guest-Token': 'guest.token',
      },
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.migrated).toBe(false)
    expect(payload.alreadyMigrated).toBe(true)
    expect(mockTx.users.delete).not.toHaveBeenCalled()
  })

  it('migrates guest data and merges conflicting player rows safely', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    } as any)
    mockGetGuestClaimsFromRequest.mockReturnValue({
      guestId: 'guest-1',
      guestName: 'Guest One',
    } as any)

    mockTx.users.findUnique.mockResolvedValue({
      id: 'guest-1',
      isGuest: true,
    })

    mockTx.players.findMany
      .mockResolvedValueOnce([
        {
          id: 'source-player-1',
          gameId: 'game-1',
          score: 12,
          finalScore: 21,
          placement: null,
          isWinner: true,
          isReady: false,
          scorecard: '{"a":1}',
        },
        {
          id: 'source-player-2',
          gameId: 'game-2',
          score: 7,
          finalScore: null,
          placement: 2,
          isWinner: false,
          isReady: true,
          scorecard: '{"b":2}',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'target-player-1',
          gameId: 'game-1',
          score: 20,
          finalScore: null,
          placement: 1,
          isWinner: false,
          isReady: true,
          scorecard: null,
        },
      ])

    mockTx.players.deleteMany.mockResolvedValue({ count: 1 })
    mockTx.players.updateMany.mockResolvedValue({ count: 1 })
    mockTx.lobbies.updateMany.mockResolvedValue({ count: 2 })
    mockTx.lobbyInvites.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    mockTx.notifications.updateMany.mockResolvedValue({ count: 3 })
    mockTx.notificationPreferences.findUnique
      .mockResolvedValueOnce({
        userId: 'guest-1',
        gameInvites: true,
        turnReminders: true,
        friendRequests: true,
        friendAccepted: true,
        unsubscribedAll: false,
      })
      .mockResolvedValueOnce({
        userId: 'user-1',
        gameInvites: false,
        turnReminders: false,
        friendRequests: false,
        friendAccepted: false,
        unsubscribedAll: false,
      })

    const request = new NextRequest('http://localhost:3000/api/user/upgrade-guest', {
      method: 'POST',
      headers: {
        'X-Guest-Token': 'guest.token',
      },
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.migrated).toBe(true)
    expect(payload.alreadyMigrated).toBe(false)
    expect(payload.movedPlayers).toBe(1)
    expect(payload.mergedPlayerConflicts).toBe(1)
    expect(payload.movedLobbies).toBe(2)
    expect(payload.movedInvites).toBe(1)
    expect(payload.movedNotifications).toBe(3)
    expect(payload.mergedNotificationPreferences).toBe(true)

    expect(mockTx.players.update).toHaveBeenCalledWith({
      where: { id: 'target-player-1' },
      data: {
        score: 20,
        finalScore: 21,
        placement: 1,
        isWinner: true,
        isReady: true,
        scorecard: '{"a":1}',
      },
    })
    expect(mockTx.players.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['source-player-1'],
        },
      },
    })
    expect(mockTx.users.delete).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
    })
  })
})
