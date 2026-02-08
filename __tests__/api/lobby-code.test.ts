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
  })

  it('should return lobby data when lobby exists', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123')
    const response = await GET(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.lobby).toBeDefined()
    expect(data.lobby.code).toBe('ABC123')
    expect(mockPrisma.lobbies.findUnique).toHaveBeenCalledWith({
      where: { code: 'ABC123' },
      include: expect.any(Object),
    })
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

  it('should return 400 when player not in lobby', async () => {
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

    expect(response.status).toBe(400)
    expect(data.error).toBe('You are not in this game')
  })
})
