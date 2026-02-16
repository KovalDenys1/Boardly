/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/state/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { restoreGameEngine } from '@/lib/game-registry'
import { notifySocket } from '@/lib/socket-url'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    players: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/game-registry', () => ({
  restoreGameEngine: jest.fn(),
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
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockRestoreGameEngine = restoreGameEngine as jest.MockedFunction<typeof restoreGameEngine>
const mockNotifySocket = notifySocket as jest.MockedFunction<typeof notifySocket>

describe('POST /api/game/[gameId]/state', () => {
  const mockAuthUser = {
    id: 'player-1',
    username: 'Player 1',
    isGuest: false,
  }

  const persistedState = {
    players: [
      { id: 'player-1', isActive: true },
      { id: 'player-2', isActive: true },
    ],
    currentPlayerIndex: 0,
    status: 'playing',
    data: {
      rollsLeft: 3,
      held: [false, false, false, false, false],
    },
    updatedAt: new Date().toISOString(),
  }

  const dbGame = {
    id: 'game-123',
    state: JSON.stringify(persistedState),
    status: 'playing',
    currentTurn: 0,
    updatedAt: new Date('2026-02-15T10:00:00.000Z'),
    lastMoveAt: new Date('2026-02-15T10:00:00.000Z'),
    players: [
      { id: 'db-player-1', userId: 'player-1', user: { id: 'player-1', bot: null } },
      { id: 'db-player-2', userId: 'player-2', user: { id: 'player-2', bot: null } },
    ],
    lobby: {
      id: 'lobby-123',
      code: 'ABCD12',
      gameType: 'yahtzee',
      turnTimer: 60,
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockNotifySocket.mockResolvedValue(true as any)
  })

  const buildRequest = (body: unknown) =>
    new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      body: JSON.stringify(body),
    })

  it('returns 401 when user is unauthorized', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)

    const response = await POST(buildRequest({ move: { type: 'roll', data: {} } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 for invalid move payload', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockAuthUser)

    const response = await POST(buildRequest({ move: {} }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid move data' })
  })

  it('returns 404 when game does not exist', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockAuthUser)
    mockPrisma.games.findUnique.mockResolvedValueOnce(null as any)

    const response = await POST(buildRequest({ move: { type: 'roll', data: {} } }), {
      params: Promise.resolve({ gameId: 'missing' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Game not found' })
  })

  it('returns 403 when user is not in game players', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ ...mockAuthUser, id: 'other-user' })
    mockPrisma.games.findUnique.mockResolvedValueOnce(dbGame as any)

    const response = await POST(buildRequest({ move: { type: 'roll', data: {} } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Not a player in this game' })
  })

  it('returns 500 on corrupted persisted game state', async () => {
    mockGetRequestAuthUser.mockResolvedValue(mockAuthUser)
    mockPrisma.games.findUnique.mockResolvedValueOnce({
      ...dbGame,
      state: 'not-json',
    } as any)

    const response = await POST(buildRequest({ move: { type: 'roll', data: {} } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })

    expect(response.status).toBe(500)
    expect((await response.json()).error).toContain('Corrupted game state')
  })

  it('processes valid move and updates persisted game snapshot', async () => {
    const engineState = {
      ...persistedState,
      currentPlayerIndex: 1,
      updatedAt: new Date().toISOString(),
      lastMoveAt: Date.now(),
    }

    const mockEngine = {
      makeMove: jest.fn().mockReturnValue(true),
      getState: jest.fn(() => engineState),
      getCurrentPlayer: jest.fn(() => ({ id: 'player-2' })),
      getPlayers: jest.fn(() => [
        { id: 'player-1', score: 10 },
        { id: 'player-2', score: 5 },
      ]),
      getScorecard: jest.fn(() => ({})),
    }

    mockGetRequestAuthUser.mockResolvedValue(mockAuthUser)
    mockPrisma.games.findUnique
      .mockResolvedValueOnce(dbGame as any)
      .mockResolvedValueOnce({
        id: 'game-123',
        status: 'playing',
        players: [
          {
            id: 'db-player-1',
            userId: 'player-1',
            score: 10,
            user: { id: 'player-1', username: 'Player 1', bot: null },
          },
          {
            id: 'db-player-2',
            userId: 'player-2',
            score: 5,
            user: { id: 'player-2', username: 'Player 2', bot: null },
          },
        ],
      } as any)
    mockPrisma.games.updateMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.players.update.mockResolvedValue({} as any)
    mockRestoreGameEngine.mockReturnValue(mockEngine as any)

    const response = await POST(buildRequest({ move: { type: 'roll', data: {} } }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockRestoreGameEngine).toHaveBeenCalledWith('yahtzee', 'game-123', persistedState)
    expect(mockPrisma.games.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'game-123', currentTurn: 0 }),
      })
    )
    expect(mockPrisma.players.update).toHaveBeenCalledTimes(2)
    expect(mockNotifySocket).toHaveBeenCalledWith(
      'lobby:ABCD12',
      'game-update',
      expect.objectContaining({
        action: 'state-change',
      })
    )
    expect(payload.game.id).toBe('game-123')
    expect(payload.serverBroadcasted).toBe(true)
  })
})
