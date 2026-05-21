/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { POST as LEAVE } from '@/app/api/lobby/[code]/leave/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    games: {
      update: jest.fn(),
    },
    players: {
      findFirst: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { api: {} },
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(() => Promise.resolve(true)),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}))

jest.mock('@/lib/lobby-snapshot', () => ({
  pickRelevantLobbyGame: jest.fn(),
}))

jest.mock('@/lib/lobby-player-requirements', () => ({
  getLobbyPlayerRequirements: jest.fn(() => ({ minPlayersRequired: 2 })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>

function makeRequest(code = 'ABC123') {
  return new NextRequest(`http://localhost/api/lobby/${code}/leave`, { method: 'POST' })
}

const HOST_ID = 'user-host'
const OTHER_ID = 'user-other'

const mockPlayer = (userId: string, extra = {}) => ({
  id: `player-${userId}`,
  userId,
  position: 0,
  createdAt: new Date('2026-01-01'),
  user: { id: userId, username: userId === HOST_ID ? 'Host' : 'Other', email: null, bot: null },
  ...extra,
})

const mockGame = (status = 'waiting', players = [mockPlayer(HOST_ID), mockPlayer(OTHER_ID)]) => ({
  id: 'game-1',
  status,
  gameType: 'yahtzee',
  updatedAt: new Date(),
  players,
})

const mockLobby = (game = mockGame()) => ({
  id: 'lobby-1',
  code: 'ABC123',
  creatorId: HOST_ID,
  isActive: true,
  games: [game],
})

beforeEach(() => {
  jest.clearAllMocks()
  mockBroadcastToLobby.mockResolvedValue(true)
  mockPrisma.lobbies.update.mockResolvedValue({} as any)
  mockPrisma.games.update.mockResolvedValue({} as any)
  mockPrisma.players.delete.mockResolvedValue({} as any)
})

describe('POST /api/lobby/[code]/leave — host reassignment', () => {
  it('reassigns host to oldest remaining human player when creator leaves a waiting lobby', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: HOST_ID } as any)
    const game = mockGame('waiting', [mockPlayer(HOST_ID), mockPlayer(OTHER_ID)])
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby(game) as any)
    mockPrisma.players.delete.mockResolvedValue({} as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(1) // remainingPlayers after delete
      .mockResolvedValueOnce(1) // remainingHumanPlayers
    mockPrisma.players.findFirst.mockResolvedValue({
      userId: OTHER_ID,
      user: { username: 'Other' },
    } as any)

    const res = await LEAVE(makeRequest(), { params: Promise.resolve({ code: 'ABC123' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.lobbyDeactivated).toBe(false)

    // creatorId updated in DB
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lobby-1' },
        data: { creatorId: OTHER_ID },
      })
    )

    // lobby-update event carries new creatorId
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'lobby-update',
      expect.objectContaining({ data: expect.objectContaining({ creatorId: OTHER_ID }) })
    )

    // player-left event carries nextCreatorId
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'player-left',
      expect.objectContaining({ nextCreatorId: OTHER_ID, nextCreatorName: 'Other' })
    )
  })

  it('does not reassign host when a non-creator leaves', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: OTHER_ID } as any)
    const game = mockGame('waiting', [mockPlayer(HOST_ID), mockPlayer(OTHER_ID)])
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby(game) as any)
    mockPrisma.players.delete.mockResolvedValue({} as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockPrisma.players.findFirst.mockResolvedValue(null)

    const res = await LEAVE(makeRequest(), { params: Promise.resolve({ code: 'ABC123' }) })

    expect(res.status).toBe(200)
    // lobbies.update should NOT have been called with creatorId
    const updateCalls = mockPrisma.lobbies.update.mock.calls
    const creatorUpdate = updateCalls.find((call) => call[0]?.data?.creatorId !== undefined)
    expect(creatorUpdate).toBeUndefined()
  })

  it('deactivates lobby when creator leaves and no human players remain', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: HOST_ID } as any)
    const game = mockGame('waiting', [mockPlayer(HOST_ID)])
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby(game) as any)
    mockPrisma.players.delete.mockResolvedValue({} as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(0) // remainingPlayers
      .mockResolvedValueOnce(0) // remainingHumanPlayers

    const res = await LEAVE(makeRequest(), { params: Promise.resolve({ code: 'ABC123' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.lobbyDeactivated).toBe(true)
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    )
  })

  it('picks reassignment candidate deterministically: lowest position, then earliest createdAt', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: HOST_ID } as any)
    const early = mockPlayer('user-early', { position: 1, createdAt: new Date('2026-01-01') })
    const late = mockPlayer('user-late', { position: 1, createdAt: new Date('2026-06-01') })
    const game = mockGame('waiting', [mockPlayer(HOST_ID), early, late])
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby(game) as any)
    mockPrisma.players.delete.mockResolvedValue({} as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
    // Simulate DB returning the correct candidate
    mockPrisma.players.findFirst.mockResolvedValue({
      userId: 'user-early',
      user: { username: 'Early' },
    } as any)

    await LEAVE(makeRequest(), { params: Promise.resolve({ code: 'ABC123' }) })

    expect(mockPrisma.players.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([
          { position: 'asc' },
          { createdAt: 'asc' },
        ]),
        where: expect.objectContaining({
          user: { bot: null },
        }),
      })
    )
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { creatorId: 'user-early' } })
    )
  })
})
