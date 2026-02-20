/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as CREATE_LOBBY } from '@/app/api/lobby/route'
import { POST as JOIN_LOBBY } from '@/app/api/lobby/[code]/route'
import { POST as ADD_BOT } from '@/app/api/lobby/[code]/add-bot/route'
import { POST as LEAVE_LOBBY } from '@/app/api/lobby/[code]/leave/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getOrCreateBotUser } from '@/lib/bot-helpers'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    games: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    players: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    lobbyInvites: {
      updateMany: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  notifySocket: jest.fn().mockResolvedValue(true),
  getServerSocketUrl: jest.fn(() => 'http://localhost:3001'),
  getSocketInternalAuthHeaders: jest.fn(() => ({})),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/lobby', () => ({
  generateLobbyCode: jest.fn(() => 'TEST123'),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    api: {},
    game: {},
    lobbyCreation: {},
  },
}))

jest.mock('@/lib/bot-helpers', () => ({
  getOrCreateBotUser: jest.fn(() => ({
    id: 'bot_123',
    username: 'AI Bot',
    bot: {
      id: 'bot_meta_1',
      botType: 'yahtzee',
      difficulty: 'medium',
    },
  })),
  isPrismaUniqueConstraintError: jest.fn(
    (error: any) => !!error && typeof error === 'object' && error.code === 'P2002'
  ),
}))

jest.mock('@/lib/game-registry', () => ({
  DEFAULT_GAME_TYPE: 'yahtzee',
  hasBotSupport: jest.fn(() => true),
  createGameEngine: jest.fn(() => ({
    getState: () => ({ players: [], currentPlayerIndex: 0, status: 'waiting', data: {} }),
  })),
}))

jest.mock('@/lib/lobby-snapshot', () => ({
  pickRelevantLobbyGame: jest.fn((games: any[]) => games[0] || null),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockGetOrCreateBotUser = getOrCreateBotUser as jest.Mock

describe('Guest mode API endpoints', () => {
  const guestUser = {
    id: 'guest_123',
    username: 'Guest User',
    isGuest: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRequestAuthUser.mockResolvedValue(guestUser)
  })

  it('creates lobby for authenticated guest user', async () => {
    mockPrisma.lobbies.create.mockResolvedValue({
      id: 'lobby_1',
      code: 'TEST123',
      name: 'Guest Lobby',
      games: [
        {
          id: 'game_1',
          status: 'waiting',
          players: [
            { userId: guestUser.id, position: 0 },
          ],
        },
      ],
    } as any)

    const req = new NextRequest('http://localhost:3000/api/lobby', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Guest Lobby',
        maxPlayers: 4,
        gameType: 'yahtzee',
      }),
    })

    const response = await CREATE_LOBBY(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.lobby.code).toBe('TEST123')
    expect(mockPrisma.lobbies.create).toHaveBeenCalled()
  })

  it('joins waiting lobby as guest player', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby_1',
      code: 'TEST123',
      maxPlayers: 4,
      password: null,
      games: [
        {
          id: 'game_1',
          status: 'waiting',
          state: JSON.stringify({ scores: [] }),
        },
      ],
    } as any)
    mockPrisma.players.findUnique.mockResolvedValue(null as any)
    mockPrisma.players.count.mockResolvedValue(1 as any)
    mockPrisma.players.create.mockResolvedValue({
      id: 'player_2',
      userId: guestUser.id,
      gameId: 'game_1',
      user: {
        id: guestUser.id,
        username: guestUser.username,
        isGuest: true,
      },
    } as any)
    mockPrisma.games.update.mockResolvedValue({} as any)

    const req = new NextRequest('http://localhost:3000/api/lobby/TEST123', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const response = await JOIN_LOBBY(req, { params: Promise.resolve({ code: 'TEST123' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.player.userId).toBe(guestUser.id)
  })

  it('allows guest lobby creator to add bot', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby_1',
      code: 'TEST123',
      creatorId: guestUser.id,
      maxPlayers: 4,
      gameType: 'yahtzee',
      games: [
        {
          id: 'game_1',
          status: 'waiting',
          players: [
            {
              user: { bot: null },
            },
          ],
        },
      ],
    } as any)
    mockPrisma.users.findFirst.mockResolvedValue(null as any)
    mockPrisma.players.create.mockResolvedValue({ id: 'bot_player_1' } as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      id: 'game_1',
      players: [],
    } as any)

    const req = new NextRequest('http://localhost:3000/api/lobby/TEST123/add-bot', {
      method: 'POST',
    })

    const response = await ADD_BOT(req, { params: Promise.resolve({ code: 'TEST123' }) })
    expect(response.status).toBe(200)
  })

  it('creates bot with selected difficulty profile for supported game', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby_ttt',
      code: 'TTT123',
      creatorId: guestUser.id,
      maxPlayers: 2,
      gameType: 'tic_tac_toe',
      games: [
        {
          id: 'game_ttt',
          status: 'waiting',
          players: [
            {
              user: { bot: null },
            },
          ],
        },
      ],
    } as any)
    mockPrisma.users.findFirst.mockResolvedValue(null as any)
    mockPrisma.players.create.mockResolvedValue({ id: 'bot_player_ttt' } as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      id: 'game_ttt',
      players: [],
    } as any)

    mockGetOrCreateBotUser.mockResolvedValue({
      id: 'bot_hard_ttt',
      username: 'Grid Grandmaster',
      bot: { id: 'bot_meta_hard_ttt', botType: 'tic_tac_toe', difficulty: 'hard' },
    } as any)

    const req = new NextRequest('http://localhost:3000/api/lobby/TTT123/add-bot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ difficulty: 'hard' }),
    })

    const response = await ADD_BOT(req, { params: Promise.resolve({ code: 'TTT123' }) })
    expect(response.status).toBe(200)
    expect(mockGetOrCreateBotUser).toHaveBeenCalledWith('Grid Grandmaster', 'tic_tac_toe', 'hard')
  })

  it('allows guest player to leave waiting lobby', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby_1',
      code: 'TEST123',
      games: [
        {
          id: 'game_1',
          status: 'waiting',
          players: [
            {
              id: 'player_guest',
              userId: guestUser.id,
              user: {
                username: guestUser.username,
                email: null,
              },
            },
          ],
        },
      ],
    } as any)
    mockPrisma.players.delete.mockResolvedValue({} as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(0 as any)
      .mockResolvedValueOnce(0 as any)
    mockPrisma.lobbies.update.mockResolvedValue({} as any)

    const req = new NextRequest('http://localhost:3000/api/lobby/TEST123/leave', {
      method: 'POST',
    })

    const response = await LEAVE_LOBBY(req, { params: Promise.resolve({ code: 'TEST123' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe('You left the lobby')
    expect(mockPrisma.players.delete).toHaveBeenCalled()
  })
})
