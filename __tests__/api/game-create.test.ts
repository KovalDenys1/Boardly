/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/create/route'
import { prisma } from '@/lib/db'
import { getOrCreateBotUser } from '@/lib/bot-helpers'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { getRequestAuthUser } from '@/lib/request-auth'

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    games: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    players: {
      create: jest.fn(),
    },
    spyLocations: {
      findMany: jest.fn(),
    },
  },
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

jest.mock('@/lib/bot-helpers', () => ({
  getOrCreateBotUser: jest.fn(),
  isPrismaUniqueConstraintError: jest.fn(
    (error: any) => !!error && typeof error === 'object' && error.code === 'P2002'
  ),
}))

jest.mock('@/lib/game-replay', () => ({
  appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetOrCreateBotUser = getOrCreateBotUser as jest.MockedFunction<typeof getOrCreateBotUser>
const mockAppendGameReplaySnapshot = appendGameReplaySnapshot as jest.MockedFunction<
  typeof appendGameReplaySnapshot
>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>

function readPersistedState(value: unknown) {
  if (typeof value === 'string') {
    return JSON.parse(value)
  }

  return JSON.parse(JSON.stringify(value ?? null))
}

describe('POST /api/game/create', () => {
  const mockSession = {
    id: 'creator-123',
    email: 'creator@example.com',
    username: 'creator',
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
    mockAppendGameReplaySnapshot.mockResolvedValue(undefined)
    mockGetOrCreateBotUser.mockResolvedValue({
      id: 'bot-user-1',
      username: 'Grid Tactician',
      bot: {
        id: 'bot-meta-1',
        botType: 'tic_tac_toe',
        difficulty: 'medium',
      },
    } as any)
  })

  it('should return 401 when user not authenticated', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)

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
    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)

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
    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(null)

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
      id: 'other-user-123',
      email: 'other@example.com',
    }
    
    mockGetRequestAuthUser.mockResolvedValue(otherUserSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
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

  it('should successfully create and start game', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [mockWaitingGame],
    } as any)
    
    const updatedGame = {
      ...mockWaitingGame,
      status: 'playing',
      gameType: 'yahtzee',
      players: mockWaitingGame.players.map((p) => ({
        ...p,
        user: {
          ...p.user,
          bot: null,
        },
      })),
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

    mockPrisma.games.update.mockResolvedValue(updatedGame as any)

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
    expect(mockPrisma.games.update).toHaveBeenCalled()
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lobby-123' },
        data: { isActive: false },
      })
    )
  })

  it('preserves configured Tic-Tac-Toe target rounds when starting from waiting state', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)

    const tttWaitingGame = {
      ...mockWaitingGame,
      state: JSON.stringify({
        data: {
          match: {
            targetRounds: 5,
            roundsPlayed: 0,
            winsBySymbol: { X: 0, O: 0 },
            draws: 0,
          },
        },
      }),
    }

    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...mockLobby,
      gameType: 'tic_tac_toe',
      maxPlayers: 2,
      games: [tttWaitingGame],
    } as any)

    let persistedState: any
    mockPrisma.games.update.mockImplementation((args: any) => {
      persistedState = readPersistedState(args.data.state)
      return Promise.resolve({
        ...tttWaitingGame,
        status: 'playing',
        gameType: 'tic_tac_toe',
        state: args.data.state,
        players: tttWaitingGame.players.map((p: any) => ({
          ...p,
          user: {
            ...p.user,
            bot: null,
          },
        })),
      } as any)
    })

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'tic_tac_toe',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 2, minPlayers: 2 },
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.game).toBeDefined()
    expect(persistedState?.data?.match?.targetRounds).toBe(5)
  })

  it('preserves configured Memory difficulty when starting from waiting state', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)

    const memoryWaitingGame = {
      ...mockWaitingGame,
      state: JSON.stringify({
        data: {
          difficulty: 'hard',
        },
      }),
    }

    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...mockLobby,
      gameType: 'memory',
      maxPlayers: 4,
      games: [memoryWaitingGame],
    } as any)

    let persistedState: any
    mockPrisma.games.update.mockImplementation((args: any) => {
      persistedState = readPersistedState(args.data.state)
      return Promise.resolve({
        ...memoryWaitingGame,
        status: 'playing',
        gameType: 'memory',
        state: args.data.state,
        players: memoryWaitingGame.players.map((p: any) => ({
          ...p,
          user: {
            ...p.user,
            bot: null,
          },
        })),
      } as any)
    })

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'memory',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.game).toBeDefined()
    expect(persistedState?.data?.difficulty).toBe('hard')
  })

  it('auto-adds bot and starts game when creator starts alone in bot-supported game', async () => {
    const gameWithOnePlayer = {
      ...mockWaitingGame,
      players: [mockWaitingGame.players[0]], // Only 1 player
    }

    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    const lobbyWithOnePlayer = {
      ...mockLobby,
      gameType: 'tic_tac_toe',
      maxPlayers: 2,
      games: [gameWithOnePlayer],
    }

    mockPrisma.lobbies.findUnique.mockResolvedValue(lobbyWithOnePlayer as any)
    mockPrisma.players.create.mockResolvedValue({ id: 'new-bot-player' } as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      ...gameWithOnePlayer,
      players: [
        ...gameWithOnePlayer.players,
        {
          id: 'player-bot',
          userId: 'bot-user-1',
          score: 0,
          position: 1,
          user: {
            id: 'bot-user-1',
            username: 'Grid Tactician',
            bot: {
              id: 'bot-meta-1',
              botType: 'tic_tac_toe',
              difficulty: 'medium',
            },
          },
        },
      ],
    } as any)
    mockPrisma.games.update.mockResolvedValue({
      ...gameWithOnePlayer,
      status: 'playing',
      gameType: 'tic_tac_toe',
      players: [
        ...gameWithOnePlayer.players,
        {
          id: 'player-bot',
          userId: 'bot-user-1',
          score: 0,
          position: 1,
          user: {
            id: 'bot-user-1',
            username: 'Grid Tactician',
            bot: {
              id: 'bot-meta-1',
              botType: 'tic_tac_toe',
              difficulty: 'medium',
            },
          },
        },
      ],
      state: JSON.stringify({
        id: 'game-123',
        gameType: 'tic_tac_toe',
        status: 'playing',
        players: [
          { id: 'creator-123', name: 'creator', score: 0 },
          { id: 'bot-user-1', name: 'Grid Tactician', score: 0 },
        ],
        currentPlayerIndex: 0,
        data: {
          board: [[null, null, null], [null, null, null], [null, null, null]],
          currentSymbol: 'X',
          moveCount: 0,
          winner: null,
        },
      }),
    } as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'tic_tac_toe',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 2, minPlayers: 2 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.game.status).toBe('playing')
    expect(mockGetOrCreateBotUser).toHaveBeenCalledWith(
      'Grid Tactician',
      'tic_tac_toe',
      'medium',
    )
    expect(mockPrisma.players.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gameId: gameWithOnePlayer.id,
          userId: 'bot-user-1',
        }),
      })
    )
  })

  it('should require 3 players for guess_the_spy', async () => {
    const spyLobby = {
      ...mockLobby,
      gameType: 'guess_the_spy',
    }

    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...spyLobby,
      games: [mockWaitingGame], // only 2 players
    } as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'guess_the_spy',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 10, minPlayers: 3 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('At least 3 players are required to start this game')
  })

  it('should start guess_the_spy with fallback locations when DB locations are empty', async () => {
    const spyLobby = {
      ...mockLobby,
      gameType: 'guess_the_spy',
    }

    const spyWaitingGame = {
      ...mockWaitingGame,
      players: [
        ...mockWaitingGame.players,
        {
          id: 'player-3',
          userId: 'user-789',
          score: 0,
          position: 2,
          user: {
            id: 'user-789',
            username: 'player3',
            email: 'player3@example.com',
            isBot: false,
          },
        },
      ],
    }

    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...spyLobby,
      games: [spyWaitingGame],
    } as any)
    mockPrisma.spyLocations.findMany.mockResolvedValue([] as any)

    let capturedState: any
    mockPrisma.games.update.mockImplementation((args: any) => {
      capturedState = readPersistedState(args.data.state)
      return Promise.resolve({
        ...spyWaitingGame,
        status: 'playing',
        gameType: 'guess_the_spy',
        state: args.data.state,
        players: spyWaitingGame.players.map((p: any) => ({
          ...p,
          user: {
            ...p.user,
            bot: null,
          },
        })),
      } as any)
    })

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'guess_the_spy',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 10, minPlayers: 3 },
      }),
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.game).toBeDefined()
    expect(data.game.status).toBe('playing')
    expect(mockPrisma.spyLocations.findMany).toHaveBeenCalled()
    expect(capturedState?.data?.phase).toBe('role_reveal')
    expect(typeof capturedState?.data?.location).toBe('string')
    expect(capturedState?.data?.location.length).toBeGreaterThan(0)
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

    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [finishedGame],
    } as any)
    mockPrisma.games.create.mockResolvedValue(newWaitingGame as any)

    const request = new NextRequest('http://localhost:3000/api/game/create', {
      method: 'POST',
      body: JSON.stringify({
        gameType: 'yahtzee',
        lobbyId: 'lobby-123',
        config: { maxPlayers: 4, minPlayers: 2 },
      }),
    })
    const response = await POST(request)

    expect(mockPrisma.games.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lobbyId: 'lobby-123',
          status: 'waiting',
        }),
      })
    )
  })

  it('returns generic 500 response without internal details on unexpected failures', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockRejectedValue(new Error('sensitive database failure'))

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

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
    expect(data.code).toBe('GAME_CREATE_FAILED')
    expect(data.details).toBeUndefined()
  })

  it('should initialize game state correctly', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockSession as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue({
      ...mockLobby,
      games: [mockWaitingGame],
    } as any)
    
    let capturedGameState: any

    mockPrisma.games.update.mockImplementation((args: any) => {
      capturedGameState = readPersistedState(args.data.state)
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
