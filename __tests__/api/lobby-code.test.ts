/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { GET, POST, PATCH } from '@/app/api/lobby/[code]/route'
import { POST as LEAVE } from '@/app/api/lobby/[code]/leave/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { broadcastToLobby } from '@/lib/supabase-server'

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
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
      update: jest.fn(),
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

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(),
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
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>
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
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma as any))
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
    expect(data.lobby.creator?.email).toBeUndefined()
    expect(data.lobby.password).toBeUndefined()
    expect(data.lobby.isPrivate).toBe(false)
    expect(data.activeGame).toBeNull()
    expect(data.game).toBeNull()
    expect(mockPrisma.lobbies.findUnique).toHaveBeenCalledWith({
      where: { code: 'ABC123' },
      select: expect.any(Object),
    })
    const queryArgs = mockPrisma.lobbies.findUnique.mock.calls[0][0] as any
    expect(queryArgs.select.creator.select.email).toBeUndefined()
    expect(queryArgs.select.games.include.players.include.user.select.isGuest).toBe(true)
    expect(queryArgs.select.games.include.players.include.user.select.bot.select.difficulty).toBe(true)
    expect(queryArgs.select.games.include.players.include.user.select.email).toBeUndefined()
  })

  it('should prioritize playing game when multiple active games exist', async () => {
    const lobbyWithMultipleGames = {
      ...mockLobby,
      games: [
        {
          id: 'game-waiting',
          status: 'waiting',
          updatedAt: new Date('2026-02-13T10:00:00.000Z'),
          players: [
            {
              user: {
                id: 'user-1',
                username: 'alpha',
                email: 'alpha@example.com',
              },
            },
          ],
        },
        {
          id: 'game-playing',
          status: 'playing',
          updatedAt: new Date('2026-02-13T09:00:00.000Z'),
          players: [
            {
              user: {
                id: 'user-2',
                username: 'beta',
                email: 'beta@example.com',
                isGuest: false,
                bot: { difficulty: 'hard' },
              },
            },
          ],
        },
      ],
    }

    mockPrisma.lobbies.findUnique.mockResolvedValue(lobbyWithMultipleGames as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123')
    const response = await GET(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.activeGame?.id).toBe('game-playing')
    expect(data.activeGame?.players?.[0]?.user?.email).toBeUndefined()
    expect(data.activeGame?.players?.[0]?.user?.isGuest).toBe(false)
    expect(data.activeGame?.players?.[0]?.user?.isBot).toBe(true)
    expect(data.activeGame?.players?.[0]?.user?.bot).toEqual({ difficulty: 'hard' })
    expect(data.game?.id).toBe('game-playing')
    expect(data.game?.players?.[0]?.user?.email).toBeUndefined()
    expect(data.game?.players?.[0]?.user?.isBot).toBe(true)
    expect(data.lobby?.games).toHaveLength(1)
    expect(data.lobby?.games?.[0]?.id).toBe('game-playing')
    expect(data.lobby?.games?.[0]?.players?.[0]?.user?.email).toBeUndefined()
  })

  it('should return 404 when lobby not found', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/lobby/INVALID')
    const response = await GET(request, { params: { code: 'INVALID' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Lobby not found')
  })

  it('should include terminal statuses when includeFinished=true', async () => {
    mockPrisma.lobbies.findUnique.mockResolvedValue(mockLobby as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123?includeFinished=true')
    const response = await GET(request, { params: { code: 'ABC123' } })
    expect(response.status).toBe(200)

    const queryArgs = mockPrisma.lobbies.findUnique.mock.calls[0][0] as any
    expect(queryArgs.select.games.where.status.in).toEqual([
      'waiting',
      'playing',
      'finished',
      'abandoned',
      'cancelled',
    ])
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.lobbies.findUnique.mockRejectedValue(new Error('Database error'))

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123')
    const response = await GET(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
    expect(data.code).toBe('LOBBY_FETCH_FAILED')
    expect(data.details).toBeUndefined()
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
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma as any))
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
    mockPrisma.games.findFirst.mockResolvedValue({ id: 'game-123', status: 'waiting' } as any)
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
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual(
      expect.objectContaining({ isolationLevel: 'Serializable' })
    )
  })

  it('should return 400 when lobby is full', async () => {
    const gameWithPlayers = {
      ...mockGame,
      players: [],
      state: JSON.stringify({ scores: [] }),
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue(mockUser as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...mockLobby,
      maxPlayers: 2,
      games: [gameWithPlayers],
    } as any)
    mockPrisma.games.findFirst.mockResolvedValue({ id: 'game-123', status: 'waiting' } as any)
    mockPrisma.players.findUnique.mockResolvedValue(null)
    mockPrisma.players.count.mockResolvedValue(2)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const response = await POST(request, { params: { code: 'ABC123' } as any })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Lobby is full')
    expect(mockPrisma.players.create).not.toHaveBeenCalled()
  })

  it('returns sanitized 500 response when join fails unexpectedly', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue(mockUser as any)
    mockPrisma.lobbies.findUnique.mockRejectedValue(new Error('Sensitive database details'))

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const response = await POST(request, { params: { code: 'ABC123' } as any })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
    expect(data.code).toBe('LOBBY_JOIN_FAILED')
    expect(data.details).toBeUndefined()
  })
})

describe('PATCH /api/lobby/[code]', () => {
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

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns sanitized 500 response when settings update fails unexpectedly', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue(mockUser as any)
    mockPrisma.lobbies.findUnique.mockRejectedValue(new Error('Sensitive settings failure'))

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'PATCH',
      body: JSON.stringify({ maxPlayers: 4 }),
    })
    const response = await PATCH(request, { params: { code: 'ABC123' } as any })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to update lobby settings')
    expect(data.code).toBe('LOBBY_UPDATE_FAILED')
    expect(data.details).toBeUndefined()
  })

  it('returns 403 when a non-premium creator enables allowSpectators', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({ ...mockUser, premiumUntil: null } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby-1',
      code: 'ABC123',
      creatorId: 'user-123',
      gameType: 'yahtzee',
      maxPlayers: 4,
      games: [],
    } as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'PATCH',
      body: JSON.stringify({ allowSpectators: true }),
    })
    const response = await PATCH(request, { params: { code: 'ABC123' } as any })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Premium required to enable spectators')
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('allows a premium creator to enable allowSpectators', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      ...mockUser,
      premiumUntil: new Date(Date.now() + 86400000),
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      id: 'lobby-1',
      code: 'ABC123',
      creatorId: 'user-123',
      gameType: 'yahtzee',
      maxPlayers: 4,
      games: [],
    } as any)
    mockPrisma.lobbies.update.mockResolvedValue({
      id: 'lobby-1',
      code: 'ABC123',
      maxPlayers: 4,
      allowSpectators: true,
      maxSpectators: 0,
      turnTimer: 60,
      theme: 'default',
      gameType: 'yahtzee',
    } as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123', {
      method: 'PATCH',
      body: JSON.stringify({ allowSpectators: true }),
    })
    const response = await PATCH(request, { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(200)
    expect(mockPrisma.lobbies.update).toHaveBeenCalled()
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
        gameType: 'yahtzee',
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
    mockBroadcastToLobby.mockResolvedValue(true as any)
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
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'testuser',
      suspended: false,
    } as any)
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

  it('deactivates waiting lobby when host leaves and only bot players remain', async () => {
    const waitingLobbyWithHostAndBot = {
      ...mockLobby,
      creatorId: 'user-123',
      games: [
        {
          id: 'game-123',
          status: 'waiting',
          players: [
            {
              id: 'player-host',
              userId: 'user-123',
              gameId: 'game-123',
              user: {
                id: 'user-123',
                username: 'host-user',
                bot: null,
              },
            },
            {
              id: 'player-bot',
              userId: 'bot-user-1',
              gameId: 'game-123',
              user: {
                id: 'bot-user-1',
                username: 'ai-bot',
                bot: { id: 'bot-1' },
              },
            },
          ],
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'host-user',
      suspended: false,
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(waitingLobbyWithHostAndBot as any)
    mockPrisma.players.delete.mockResolvedValue({ id: 'player-host' } as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(1) // remaining players (bot only)
      .mockResolvedValueOnce(0) // remaining human players

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(
      expect.objectContaining({
        gameEnded: false,
        lobbyDeactivated: true,
      })
    )
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith({
      where: { id: 'lobby-123' },
      data: { isActive: false },
    })
    expect(mockPrisma.games.update).not.toHaveBeenCalled()
    // lobby-list updates now handled by Postgres Changes on Lobbies table
  })

  it('reassigns waiting lobby creator when host leaves and human players remain', async () => {
    const waitingLobbyWithReplacementHost = {
      ...mockLobby,
      creatorId: 'user-123',
      games: [
        {
          id: 'game-123',
          status: 'waiting',
          players: [
            {
              id: 'player-host',
              userId: 'user-123',
              gameId: 'game-123',
              position: 0,
              createdAt: new Date('2026-03-16T12:00:00.000Z'),
              user: {
                id: 'user-123',
                username: 'host-user',
                email: 'host@example.com',
                bot: null,
              },
            },
            {
              id: 'player-456',
              userId: 'user-456',
              gameId: 'game-123',
              position: 1,
              createdAt: new Date('2026-03-16T12:00:10.000Z'),
              user: {
                id: 'user-456',
                username: 'second-user',
                email: 'second@example.com',
                bot: null,
              },
            },
          ],
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'host-user',
      suspended: false,
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(waitingLobbyWithReplacementHost as any)
    mockPrisma.players.delete.mockResolvedValue({ id: 'player-host' } as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(1) // remaining players
      .mockResolvedValueOnce(1) // remaining human players
    mockPrisma.players.findFirst.mockResolvedValue({
      userId: 'user-456',
      user: {
        username: 'second-user',
      },
    } as any)
    mockPrisma.lobbies.update.mockResolvedValue({
      id: 'lobby-123',
      creatorId: 'user-456',
      isActive: true,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(
      expect.objectContaining({
        gameEnded: false,
        lobbyDeactivated: false,
      })
    )
    expect(mockPrisma.players.findFirst).toHaveBeenCalledWith({
      where: {
        gameId: 'game-123',
        leftAt: null,
        user: {
          bot: null,
        },
      },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      select: {
        userId: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    })
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith({
      where: { id: 'lobby-123' },
      data: { creatorId: 'user-456' },
    })
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'player-left',
      expect.objectContaining({
        userId: 'user-123',
        playerId: 'user-123',
        nextCreatorId: 'user-456',
        nextCreatorName: 'second-user',
        remainingPlayers: 1,
      })
    )
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'lobby-update',
      expect.objectContaining({
        lobbyCode: 'ABC123',
        type: 'player-left',
      })
    )
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
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'testuser',
      suspended: false,
    } as any)
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
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'testuser',
      suspended: false,
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(lobbyWithMultipleGames as any)
    mockPrisma.players.update.mockResolvedValue({ id: 'player-123' } as any)
    mockPrisma.players.count.mockResolvedValue(1)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })

    expect(response.status).toBe(200)
    expect(mockPrisma.players.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'player-123' } })
    )
    expect(mockPrisma.players.delete).not.toHaveBeenCalled()
  })

  it('removes player from a finished game without reassigning creator (post-game host control)', async () => {
    const finishedLobby = {
      ...mockLobby,
      creatorId: 'user-123',
      games: [
        {
          id: 'game-finished',
          status: 'finished',
          updatedAt: new Date('2026-03-18T12:00:00.000Z'),
          players: [
            {
              id: 'player-123',
              userId: 'user-123',
              gameId: 'game-finished',
              position: 0,
              createdAt: new Date('2026-03-18T12:00:00.000Z'),
              user: {
                id: 'user-123',
                username: 'testuser',
                email: 'test@example.com',
                bot: null,
              },
            },
            {
              id: 'player-456',
              userId: 'user-456',
              gameId: 'game-finished',
              position: 1,
              createdAt: new Date('2026-03-18T12:00:10.000Z'),
              user: {
                id: 'user-456',
                username: 'another-user',
                email: 'another@example.com',
                bot: null,
              },
            },
          ],
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'testuser',
      suspended: false,
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(finishedLobby as any)
    mockPrisma.players.update.mockResolvedValue({ id: 'player-123' } as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockPrisma.players.findFirst.mockResolvedValue({
      userId: 'user-456',
      user: {
        username: 'another-user',
      },
    } as any)
    mockPrisma.lobbies.update.mockResolvedValue({
      id: 'lobby-123',
      creatorId: 'user-456',
      isActive: true,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(
      expect.objectContaining({
        message: 'You left the lobby',
        gameEnded: false,
        lobbyDeactivated: false,
      })
    )
    expect(mockPrisma.players.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'player-123' } })
    )
    expect(mockPrisma.players.delete).not.toHaveBeenCalled()
    expect(mockPrisma.games.update).not.toHaveBeenCalled()
    // Creator is NOT reassigned during post-game state
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { creatorId: expect.any(String) } })
    )
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'player-left',
      expect.objectContaining({
        userId: 'user-123',
        playerId: 'user-123',
        hostLeft: true,
        remainingPlayers: 1,
      })
    )
  })

  it('awaits broadcast and returns 200 when other players remain', async () => {
    const playingLobby = {
      ...mockLobby,
      games: [
        {
          id: 'game-123',
          status: 'playing',
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
            {
              id: 'player-456',
              userId: 'user-456',
              gameId: 'game-123',
              user: {
                id: 'user-456',
                username: 'another-user',
              },
            },
          ],
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'testuser',
      suspended: false,
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(playingLobby as any)
    mockPrisma.players.update.mockResolvedValue({ id: 'player-123' } as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(2) // remaining players
      .mockResolvedValueOnce(2) // remaining human players

    mockBroadcastToLobby.mockResolvedValue(true as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })

    const response = await LEAVE(request, { params: { code: 'ABC123' } })

    expect(response.status).toBe(200)
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'player-left',
      expect.objectContaining({
        playerId: 'user-123',
      })
    )
  })

  it('abandons playing game when leave results in bot-only players', async () => {
    const playingLobbyWithBotLeft = {
      ...mockLobby,
      games: [
        {
          id: 'game-123',
          status: 'playing',
          players: [
            {
              id: 'player-human',
              userId: 'user-123',
              gameId: 'game-123',
              user: {
                id: 'user-123',
                username: 'testuser',
                bot: null,
              },
            },
            {
              id: 'player-bot',
              userId: 'bot-user-1',
              gameId: 'game-123',
              user: {
                id: 'bot-user-1',
                username: 'ai-bot',
                bot: { id: 'bot-1' },
              },
            },
          ],
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'testuser',
      suspended: false,
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(playingLobbyWithBotLeft as any)
    mockPrisma.players.update.mockResolvedValue({ id: 'player-human' } as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(1) // remaining players
      .mockResolvedValueOnce(0) // remaining human players
    mockPrisma.games.update.mockResolvedValue({ id: 'game-123', status: 'abandoned' } as any)
    mockPrisma.lobbies.update.mockResolvedValue({ id: 'lobby-123', isActive: false } as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(
      expect.objectContaining({
        gameEnded: true,
        gameAbandoned: true,
        lobbyDeactivated: true,
      })
    )
    expect(mockPrisma.games.update).toHaveBeenCalledWith({
      where: { id: 'game-123' },
      data: expect.objectContaining({
        status: 'abandoned',
      }),
    })
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'game-abandoned',
      expect.objectContaining({ reason: 'no_human_players' })
    )
  })

  it('abandons a playing match when leave drops it below the game minimum player count', async () => {
    const multiplayerLobby = {
      ...mockLobby,
      games: [
        {
          id: 'game-123',
          gameType: 'guess_the_spy',
          status: 'playing',
          players: [
            {
              id: 'player-123',
              userId: 'user-123',
              gameId: 'game-123',
              user: {
                id: 'user-123',
                username: 'testuser',
                bot: null,
              },
            },
            {
              id: 'player-456',
              userId: 'user-456',
              gameId: 'game-123',
              user: {
                id: 'user-456',
                username: 'another-user',
                bot: null,
              },
            },
            {
              id: 'player-789',
              userId: 'user-789',
              gameId: 'game-123',
              user: {
                id: 'user-789',
                username: 'third-user',
                bot: null,
              },
            },
          ],
        },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-123',
      username: 'testuser',
      suspended: false,
    } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(multiplayerLobby as any)
    mockPrisma.players.update.mockResolvedValue({ id: 'player-123' } as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
    mockPrisma.games.update.mockResolvedValue({ id: 'game-123', status: 'abandoned' } as any)
    mockPrisma.lobbies.update.mockResolvedValue({ id: 'lobby-123', isActive: false } as any)

    const request = new NextRequest('http://localhost:3000/api/lobby/ABC123/leave', {
      method: 'POST',
    })
    const response = await LEAVE(request, { params: { code: 'ABC123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(
      expect.objectContaining({
        gameEnded: true,
        gameAbandoned: true,
        lobbyDeactivated: true,
      })
    )
    expect(mockPrisma.games.update).toHaveBeenCalledWith({
      where: { id: 'game-123' },
      data: expect.objectContaining({
        status: 'abandoned',
      }),
    })
    expect(mockBroadcastToLobby).toHaveBeenCalledWith(
      'ABC123',
      'game-abandoned',
      expect.objectContaining({ reason: 'insufficient_players' })
    )
  })
})
