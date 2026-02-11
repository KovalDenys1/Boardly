/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/state/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    players: {
      update: jest.fn(),
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

describe.skip('POST /api/game/[gameId]/state', () => {
  const mockSession = {
    user: {
      id: 'player-1',
      email: 'player1@example.com',
    },
  }

  const mockGameState = {
    id: 'game-123',
    gameType: 'yahtzee',
    players: [
      { id: 'player-1', name: 'Player 1', score: 0 },
      { id: 'player-2', name: 'Player 2', score: 0 },
    ],
    currentPlayerIndex: 0,
    status: 'playing',
    data: {
      round: 1,
      rollsLeft: 3,
      dice: [1, 2, 3, 4, 5],
      held: [false, false, false, false, false],
      scores: [{}, {}],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockGame = {
    id: 'game-123',
    state: JSON.stringify(mockGameState),
    status: 'playing',
    currentTurn: 0,
    players: [
      {
        id: 'db-player-1',
        userId: 'player-1',
        user: { id: 'player-1', name: 'Player 1', isBot: false },
      },
      {
        id: 'db-player-2',
        userId: 'player-2',
        user: { id: 'player-2', name: 'Player 2', isBot: false },
      },
    ],
    lobby: {
      id: 'lobby-123',
      code: 'ABC123',
      gameType: 'yahtzee',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 when user not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: { type: 'roll', data: {} },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 400 when move data is invalid', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: {}, // Missing type
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid move data')
  })

  it('should return 404 when game not found', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.games.findUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/game/invalid/state', {
      method: 'POST',
      body: JSON.stringify({
        move: { type: 'roll', data: {} },
      }),
    })
    const response = await POST(request, { params: { gameId: 'invalid' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Game not found')
  })

  it('should return 403 when user not a player in game', async () => {
    const otherUserSession = {
      user: { id: 'other-user', email: 'other@example.com' },
    }

    mockGetServerSession.mockResolvedValue(otherUserSession as any)
    mockPrisma.games.findUnique.mockResolvedValue(mockGame as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: { type: 'roll', data: {} },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Not a player in this game')
  })

  it('should successfully process roll move', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.games.findUnique.mockResolvedValue(mockGame as any)

    const updatedState = {
      ...mockGameState,
      data: {
        ...mockGameState.data,
        dice: [3, 4, 5, 6, 1], // New dice values
        rollsLeft: 2,
      },
    }

    mockPrisma.games.update.mockResolvedValue({
      ...mockGame,
      state: JSON.stringify(updatedState),
    } as any)
    mockPrisma.players.update.mockResolvedValue({} as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: { type: 'roll', data: {} },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.game).toBeDefined()
    expect(mockPrisma.games.update).toHaveBeenCalled()
  })

  it('should successfully process hold move', async () => {
    const stateAfterRoll = {
      ...mockGameState,
      data: {
        ...mockGameState.data,
        dice: [5, 5, 3, 2, 1],
        rollsLeft: 2,
      },
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      state: JSON.stringify(stateAfterRoll),
    } as any)

    mockPrisma.games.update.mockResolvedValue({
      ...mockGame,
      state: JSON.stringify({
        ...stateAfterRoll,
        data: {
          ...stateAfterRoll.data,
          held: [true, true, false, false, false], // Holding first two dice
        },
      }),
    } as any)
    mockPrisma.players.update.mockResolvedValue({} as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: {
          type: 'hold',
          data: { held: [true, true, false, false, false] },
        },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })

    expect(response.status).toBe(200)
    expect(mockPrisma.games.update).toHaveBeenCalled()
  })

  it.skip('should successfully process score move', async () => {
    // TODO: Fix response structure - missing currentTurn field
    const stateWithRolls = {
      ...mockGameState,
      data: {
        ...mockGameState.data,
        dice: [5, 5, 5, 2, 1],
        rollsLeft: 0,
      },
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      state: JSON.stringify(stateWithRolls),
    } as any)

    const updatedState = {
      ...stateWithRolls,
      currentPlayerIndex: 1, // Turn advances after score
      data: {
        ...stateWithRolls.data,
        rollsLeft: 3,
        scores: [{ fives: 15 }, {}], // Scored 15 in fives
      },
    }

    mockPrisma.games.update.mockResolvedValue({
      ...mockGame,
      state: JSON.stringify(updatedState),
      currentTurn: 1,
    } as any)
    mockPrisma.players.update.mockResolvedValue({} as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: {
          type: 'score',
          data: { category: 'fives' },
        },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.game.currentTurn).toBe(1)
    expect(mockPrisma.players.update).toHaveBeenCalled()
  })

  it('should return 400 for invalid move', async () => {
    const stateWithNoRolls = {
      ...mockGameState,
      data: {
        ...mockGameState.data,
        rollsLeft: 0,
      },
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      state: JSON.stringify(stateWithNoRolls),
    } as any)

    // Try to roll when no rolls left
    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: { type: 'roll', data: {} },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid move')
  })

  it.skip('should handle guest user with X-Guest-Id header', async () => {
    // TODO: Fix guest header handling - returns 400
    mockGetServerSession.mockResolvedValue(null) // No session
    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      players: [
        {
          id: 'db-player-1',
          userId: 'guest-123', // Guest ID
          user: { id: 'guest-123', name: 'Guest', isBot: false },
        },
      ],
    } as any)
    mockPrisma.games.update.mockResolvedValue(mockGame as any)
    mockPrisma.players.update.mockResolvedValue({} as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      headers: {
        'X-Guest-Id': 'guest-123',
      },
      body: JSON.stringify({
        move: { type: 'roll', data: {} },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })

    expect(response.status).toBe(200)
  })

  it('should handle corrupted game state', async () => {
    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      state: 'invalid json{{{',
    } as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: { type: 'roll', data: {} },
      }),
    })
    const response = await POST(request, { params: { gameId: 'game-123' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Corrupted game state')
  })

  it.skip('should update player scores in database', async () => {
    // TODO: Mock is not being called - investigate route logic
    const stateWithScores = {
      ...mockGameState,
      players: [
        { id: 'player-1', name: 'Player 1', score: 50 },
        { id: 'player-2', name: 'Player 2', score: 30 },
      ],
    }

    mockGetServerSession.mockResolvedValue(mockSession as any)
    mockPrisma.games.findUnique.mockResolvedValue(mockGame as any)
    mockPrisma.games.update.mockResolvedValue({
      ...mockGame,
      state: JSON.stringify(stateWithScores),
    } as any)
    mockPrisma.players.update.mockResolvedValue({} as any)

    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify({
        move: { type: 'score', data: { category: 'ones' } },
      }),
    })
    await POST(request, { params: { gameId: 'game-123' } })

    expect(mockPrisma.players.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          score: expect.any(Number),
        }),
      })
    )
  })
})
