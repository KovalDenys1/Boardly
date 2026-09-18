/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as JOIN_GUEST } from '@/app/api/lobby/[code]/join-guest/route'
import { prisma } from '@/lib/db'

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
