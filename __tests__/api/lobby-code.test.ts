/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/lobby/[code]/route'
import { POST as LEAVE } from '@/app/api/lobby/[code]/leave/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    games: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    players: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    lobbyInvites: {
      updateMany: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/socket-url', () => ({
  notifySocket: jest.fn(),
  getServerSocketUrl: jest.fn(() => 'http://localhost:3001'),
  getSocketInternalAuthHeaders: jest.fn(() => ({})),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockFetch = jest.fn()

global.fetch = mockFetch as any

describe('GET /api/lobby/[code]', () => {
  const mockLobby = {
    id: 'lobby-123',
    code: 'ABC123',
    name: 'Test Lobby',
    password: null,
    maxPlayers: 4,
    isActive: true,
    gameType: 'yahtzee',
    creatorId: 'user-123',
    createdAt: new Date(),
    creator: {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
    },
    games: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
  })

  it('should return lobby data when lobby exists', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123')
    const response = await GET(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.lobby).toBeDefined()
    expect(data.lobby.code).toBe('ABC123')
    expect(data.lobby.password).toBeUndefined()
    expect(data.lobby.isPrivate).toBe(false)
    expect(data.activeGame).toBeNull()
    expect(data.game).toBeNull()
    expect(mockPrisma.lobbies.findUnique).toHaveBeenCalledWith({
      where: { code: 'ABC123' },
      select: expect.any(Object),
    })
  })

  it('should prioritize playing game when multiple active games exist', async () => {
    const lobbyWithMultipleGames = {
      ...mockLobby,
      games: [
        {
          id: 'game-waiting',
          status: 'waiting',
          updatedAt: new Date('2026-02-13T10:00:00.000Z'),
          players: [],
        },
        {
          id: 'game-playing',
          status: 'playing',
          updatedAt: new Date('2026-02-13T09:00:00.000Z'),
          players: [],
        },
      ],
    }

    mockPrisma.lobbies.findUnique.mockResolvedValue(lobbyWithMultipleGames as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123')
    const response = await GET(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.activeGame?.id).toBe('game-playing')
    expect(data.game?.id).toBe('game-playing')
    expect(data.lobby?.games).toHaveLength(1)
    expect(data.lobby?.games?.[0]?.id).toBe('game-playing')
  })

  it('should return 404 when lobby not found', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/lobby/INVALID')
    const response = await GET(request, { params: { code: 'INVALID' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Lobby not found')
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.lobbies.findUnique.mockRejectedValue(new Error('Database error'))

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123')
    const response = await GET(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
  })
})

describe('POST /api/lobby/[code]', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    },
  }

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    isBot: false,
  }

  const mockLobby = {
    id: 'lobby-123',
    code: 'ABC123',
    name: 'Test Lobby',
    password: null,
    maxPlayers: 4,
    creatorId: 'creator-123',
    games: [],
  }

  const mockGame = {
    id: 'game-123',
    lobbyId: 'lobby-123',
    status: 'waiting',
    state: JSON.stringify({}),
    createdAt: new Date(),
    players: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
  })

  it('should return 401 when user not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const response = await POST(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 when lobby not found', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue(mockUser as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/lobby/INVALID', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const response = await POST(request, { params: { code: 'INVALID' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Lobby not found')
  })

  it('should return 403 when password is incorrect', async () => {
    const lobbyWithPassword = { ...mockLobby, password: 'secret123' }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue(mockUser as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(lobbyWithPassword as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong' }),
    })
    const response = await POST(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Invalid password')
  })

  it('should successfully join lobby with correct password', async () => {
    const lobbyWithPassword = { ...mockLobby, password: 'secret123' }
    const gameWithPlayers = {
      ...mockGame,
      players: [],
      state: JSON.stringify({ scores: [] })
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue(mockUser as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...lobbyWithPassword,
      games: [gameWithPlayers],
    } as any)
    mockPrisma.players.findUnique.mockResolvedValue(null) // Player not already in game
    mockPrisma.players.count.mockResolvedValue(0) // No players yet
    mockPrisma.players.create.mockResolvedValue({
      id: 'player-123',
      userId: 'user-123',
      gameId: 'game-123',
      score: 0,
      position: 0,
      user: {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        isGuest: false,
      },
    } as any)
    mockPrisma.games.update.mockResolvedValue(gameWithPlayers as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret123' }),
    })
    const response = await POST(request, { params: { code: 'ABC123' } })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.player).toBeDefined()
    expect(data.game).toBeDefined()
  })
})

describe('POST /api/lobby/[code]/leave', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  }

  const mockLobby = {
    id: 'lobby-123',
    code: 'ABC123',
    games: [
      {
        id: 'game-123',
        status: 'waiting',
        players: [
          {
            id: 'player-123',
            userId: 'user-123',
            gameId: 'game-123',
            user: {
              id: 'user-123',
              username: 'testuser',
            },
          },
        ],
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
  })

  it('should return 401 when user not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should successfully remove player from lobby', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby as any)
    mockPrisma.players.delete.mockResolvedValue({ id: 'player-123' } as any)
    mockPrisma.players.count.mockResolvedValue(1) // 1 remaining player

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe('You left the lobby')
    expect(mockPrisma.players.delete).toHaveBeenCalledWith({
      where: { id: 'player-123' },
    })
  })

  it('should return success when player is already absent from lobby', async () => {
    const lobbyWithoutPlayer = {
      ...mockLobby,
      games: [
        {
          ...mockLobby.games[0],
          players: [], // No players in game
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(lobbyWithoutPlayer as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe('You already left the lobby')
  })

  it('should remove player from the game that actually contains them', async () => {
    const lobbyWithMultipleGames = {
      ...mockLobby,
      games: [
        {
          id: 'game-waiting',
          status: 'waiting',
          players: [],
        },
        {
          id: 'game-playing',
          status: 'playing',
          players: [
            {
              id: 'player-123',
              userId: 'user-123',
              gameId: 'game-playing',
              user: {
                id: 'user-123',
                username: 'testuser',
              },
            },
          ],
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(lobbyWithMultipleGames as any)
    mockPrisma.players.delete.mockResolvedValue({ id: 'player-123' } as any)
    mockPrisma.players.count.mockResolvedValue(1)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })

    expect(response.status).toBe(200)
    expect(mockPrisma.players.delete).toHaveBeenCalledWith({
      where: { id: 'player-123' },
    })
  })
})
