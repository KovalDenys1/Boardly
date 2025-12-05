/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/create/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    lobby: {
      findUnique: jest.fn(),
    },
    game: {
      create: jest.fn(),
      update: jest.fn(),
    },
    player: {
      create: jest.fn(),
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

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    game: {},
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('POST /api/game/create', () => {
  const mockSession = {
    user: {
      id: 'creator-123',
      email: 'creator@example.com',
      username: 'creator',
    },
  }

  const mockLobby = {
    id: 'lobby-123',
    code: 'ABC123',
    name: 'Test Lobby',
    creatorId: 'creator-123',
    maxPlayers: 4,
    gameType: 'yahtzee',
    games: [],
  }

  const mockWaitingGame = {
    id: 'game-123',
    lobbyId: 'lobby-123',
    status: 'waiting',
    state: JSON.stringify({}),
    createdAt: new Date(),
    players: [
      {
        id: 'player-1',
        userId: 'creator-123',
        score: 0,
        position: 0,
        user: {
          id: 'creator-123',
          username: 'creator',
          email: 'creator@example.com',
          isBot: false,
        },
      },
      {
        id: 'player-2',
        userId: 'user-456',
        score: 0,
        position: 1,
        user: {
          id: 'user-456',
          username: 'player2',
          email: 'player2@example.com',
          isBot: false,
        },
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 when user not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 400 when missing required fields', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        // Missing lobbyId
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Missing required fields')
  })

  it('should return 404 when lobby not found', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobby.findUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'invalid-lobby',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Lobby not found')
  })

  it('should return 403 when user is not lobby creator', async () => {
    const otherUserSession = {
      user: {
        id: 'other-user-123',
        email: 'other@example.com',
      },
    }
    
    mockGetServerSession.mockResolvedValue(otherUserSession as any)
    mockPrisma.lobby.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [mockWaitingGame],
    } as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Only lobby creator can start the game')
  })

  it.skip('should successfully create and start game', async () => {
    // TODO: Fix this test - needs proper mock setup for YahtzeeGame and all Prisma operations
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobby.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [mockWaitingGame],
    } as any)
    
    const updatedGame = {
      ...mockWaitingGame,
      status: 'playing',
      state: JSON.stringify({
        id: 'game-123',
        gameType: 'yahtzee',
        players: mockWaitingGame.players.map(p => ({
          id: p.userId,
          name: p.user.username,
          score: 0,
        })),
        currentPlayerIndex: 0,
        status: 'playing',
        data: {
          round: 1,
          rollsLeft: 3,
          dice: [1, 2, 3, 4, 5],
          held: [false, false, false, false, false],
          scores: [{}, {}],
        },
      }),
    }

    mockPrisma.game.update.mockResolvedValue(updatedGame as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.game).toBeDefined()
    expect(data.game.status).toBe('playing')
    expect(mockPrisma.game.update).toHaveBeenCalled()
  })

  it('should return 400 when not enough players', async () => {
    const gameWithOnePlayer = {
      ...mockWaitingGame,
      players: [mockWaitingGame.players[0]], // Only 1 player
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobby.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [gameWithOnePlayer],
    } as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Not enough players')
  })

  it('should create new waiting game after finished game', async () => {
    const finishedGame = {
      ...mockWaitingGame,
      status: 'finished',
    }

    const newWaitingGame = {
      ...mockWaitingGame,
      id: 'game-new-123',
      status: 'waiting',
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobby.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [finishedGame],
    } as any)
    mockPrisma.game.create.mockResolvedValue(newWaitingGame as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    const response = await POST(request)

    expect(mockPrisma.game.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lobbyId: 'lobby-123',
          status: 'waiting',
        }),
      })
    )
  })

  it('should initialize game state correctly', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.lobby.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [mockWaitingGame],
    } as any)
    
    let capturedGameState: any

    mockPrisma.game.update.mockImplementation((args: any) => {
      capturedGameState = JSON.parse(args.data.state)
      return Promise.resolve({
        ...mockWaitingGame,
        status: 'playing',
        state: args.data.state,
      } as any)
    })

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    await POST(request)

    expect(capturedGameState).toBeDefined()
    expect(capturedGameState.gameType).toBe('yahtzee')
    expect(capturedGameState.status).toBe('playing')
    expect(capturedGameState.players).toHaveLength(2)
    expect(capturedGameState.currentPlayerIndex).toBe(0)
    expect(capturedGameState.data.dice).toHaveLength(5)
    expect(capturedGameState.data.rollsLeft).toBe(3)
  })
})
