/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as JOIN_GUEST } from '@/app/api/lobby/[code]/join-guest/route'
import { prisma } from '@/lib/db'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    games: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    players: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { game: {} },
}))

jest.mock('@/lib/guest-auth', () => ({
  createGuestId: jest.fn(() => 'guest-new'),
  createGuestToken: jest.fn(() => 'guest-token'),
  getGuestTokenFromRequest: jest.fn(() => undefined),
  verifyGuestToken: jest.fn(() => null),
}))

jest.mock('@/lib/guest-helpers', () => ({
  getOrCreateGuestUser: jest.fn(async () => ({
    id: 'guest-new',
    username: 'Newcomer',
    isGuest: true,
  })),
}))

jest.mock('@/lib/signup-source', () => ({
  getSignupSourceFromRequest: jest.fn(() => null),
}))

jest.mock('@/lib/lobby-password', () => ({
  hashLobbyPassword: jest.fn(),
  isHashedLobbyPassword: jest.fn(() => true),
  verifyLobbyPassword: jest.fn(async () => true),
}))

jest.mock('@/lib/lobby-participation', () => ({
  recordLobbyParticipation: jest.fn(async () => undefined),
}))

jest.mock('@/lib/game-registry', () => ({
  DEFAULT_GAME_TYPE: 'yahtzee',
  isSupportedGameType: jest.fn(() => true),
  createGameEngine: jest.fn(() => ({
    getState: () => ({ players: [], currentPlayerIndex: 0, status: 'waiting', data: {} }),
  })),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function joinRequest() {
  return new NextRequest('http://localhost:3000/api/lobby/ABC123/join-guest', {
    method: 'POST',
    body: JSON.stringify({ guestName: 'Newcomer' }),
  })
}

describe('POST /api/lobby/[code]/join-guest — joining after the game finished (#1005)', () => {
  const lobby = {
    id: 'lobby-1',
    code: 'ABC123',
    password: null,
    maxPlayers: 4,
    gameType: 'yahtzee',
    allowSpectators: true,
    kickedUserIds: [],
    games: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.lobbies.findUnique.mockResolvedValue(lobby as any)
    mockPrisma.games.findFirst.mockResolvedValue({
      players: [
        { userId: 'player-a', user: { bot: null } },
        { userId: 'bot-1', user: { bot: { id: 'bot-row-1' } } },
        { userId: 'player-b', user: { bot: null } },
      ],
    } as any)
    mockPrisma.games.create.mockResolvedValue({ id: 'game-new', players: [] } as any)
  })

  it('seats the finished match ahead of the newcomer instead of opening an empty room', async () => {
    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(200)
    expect(mockPrisma.games.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'waiting',
          players: {
            create: [
              { userId: 'player-a', position: 0 },
              { userId: 'player-b', position: 1 },
              { userId: 'guest-new', position: 2 },
            ],
          },
        }),
      })
    )
  })

  it('reports a full lobby rather than seating the newcomer over the previous roster', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({ ...lobby, maxPlayers: 2 } as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Lobby is full')
    // The code is what the client picks a translation by; the English sentence
    // stays for the logs and for a client loaded before #967.
    expect(data.code).toBe('LOBBY_FULL')
    expect(mockPrisma.games.create).not.toHaveBeenCalled()
  })

  it('refuses a kicked guest returning on the same token (#1013)', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...lobby,
      kickedUserIds: ['guest-new'],
    } as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.code).toBe('KICKED_FROM_LOBBY')
    expect(mockPrisma.games.create).not.toHaveBeenCalled()
    expect(mockPrisma.players.create).not.toHaveBeenCalled()
  })

  it('leaves a kicked player out of the roster it carries into the new room (#1013)', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...lobby,
      kickedUserIds: ['player-b'],
    } as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(200)
    expect(mockPrisma.games.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          players: {
            create: [
              { userId: 'player-a', position: 0 },
              { userId: 'guest-new', position: 1 },
            ],
          },
        }),
      })
    )
  })

  it('still opens a fresh room when the lobby has never finished a game', async () => {
    mockPrisma.games.findFirst.mockResolvedValue(null)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(200)
    expect(mockPrisma.games.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          players: { create: [{ userId: 'guest-new', position: 0 }] },
        }),
      })
    )
  })
})

describe('POST /api/lobby/[code]/join-guest — no Users row before the join is decided (#1157)', () => {
  const baseLobby = {
    id: 'lobby-1',
    code: 'ABC123',
    password: null,
    maxPlayers: 2,
    gameType: 'yahtzee',
    allowSpectators: true,
    kickedUserIds: [],
    games: [],
  }
  const mockGetOrCreateGuestUser = getOrCreateGuestUser as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.games.findFirst.mockResolvedValue(null)
    mockPrisma.games.create.mockResolvedValue({ id: 'game-new', players: [] } as any)
  })

  it('looks up active lobbies only', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(null)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(404)
    expect(mockPrisma.lobbies.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'ABC123', isActive: true } })
    )
    expect(mockGetOrCreateGuestUser).not.toHaveBeenCalled()
  })

  it('mints no guest for a full lobby', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...baseLobby,
      games: [{ id: 'g1', status: 'waiting', players: [{ userId: 'a' }, { userId: 'b' }] }],
    } as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('LOBBY_FULL')
    expect(mockGetOrCreateGuestUser).not.toHaveBeenCalled()
  })

  it('mints no guest when the carried roster already fills the lobby', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(baseLobby as any)
    mockPrisma.games.findFirst.mockResolvedValue({
      players: [
        { userId: 'a', user: { bot: null } },
        { userId: 'b', user: { bot: null } },
      ],
    } as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(400)
    expect(mockGetOrCreateGuestUser).not.toHaveBeenCalled()
  })

  it('mints no guest for a game in progress', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...baseLobby,
      maxPlayers: 4,
      games: [{ id: 'g1', status: 'playing', players: [{ userId: 'a' }] }],
    } as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(409)
    expect(mockGetOrCreateGuestUser).not.toHaveBeenCalled()
  })

  it('mints no guest for a kicked guest', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...baseLobby,
      kickedUserIds: ['guest-new'],
    } as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(403)
    expect(mockGetOrCreateGuestUser).not.toHaveBeenCalled()
  })

  it('mints the guest once the join is going ahead', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(baseLobby as any)

    const response = await JOIN_GUEST(joinRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(200)
    expect(mockGetOrCreateGuestUser).toHaveBeenCalledTimes(1)
    expect(mockGetOrCreateGuestUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.games.create.mock.invocationCallOrder[0]
    )
  })
})
