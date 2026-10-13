/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/game/[gameId]/replay/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { decodeGameReplaySnapshots } from '@/lib/game-replay'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
    },
    games: {
      findUnique: jest.fn(),
    },
    gameStateSnapshots: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/game-replay', () => ({
  decodeGameReplaySnapshots: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockDecodeGameReplaySnapshots = decodeGameReplaySnapshots as jest.MockedFunction<
  typeof decodeGameReplaySnapshots
>

describe('GET /api/game/[gameId]/replay', () => {
  const mockGame = {
    id: 'game-1',
    state: JSON.stringify({ status: 'finished' }),
    gameType: 'yahtzee',
    status: 'finished',
    createdAt: new Date('2026-02-27T18:00:00.000Z'),
    updatedAt: new Date('2026-02-27T18:10:00.000Z'),
    lobby: {
      code: 'ABCD12',
      name: 'Test Lobby',
    },
    players: [
      {
        userId: 'user-1',
        position: 0,
        user: { username: 'User 1', bot: null },
      },
      {
        userId: 'user-2',
        position: 1,
        user: { username: 'User 2', bot: null },
      },
    ],
  }

  const buildRequest = (url = 'http://localhost:3000/api/game/game-1/replay') =>
    new NextRequest(url, { method: 'GET' })

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.users.findUnique.mockResolvedValue({ premiumUntil: new Date(Date.now() + 86400000) } as any)
    mockPrisma.games.findUnique.mockResolvedValue(mockGame as any)
    mockPrisma.gameStateSnapshots.findMany.mockResolvedValue([] as any)
    mockDecodeGameReplaySnapshots.mockReturnValue([
      {
        id: 'snapshot-1',
        turnNumber: 0,
        playerId: 'user-1',
        actionType: 'game:start',
        actionPayload: { foo: 'bar' },
        state: { status: 'playing' },
        createdAt: '2026-02-27T18:00:05.000Z',
      },
    ] as any)
  })

  it('returns 401 when request is unauthorized', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 when user is not part of game players', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'outsider' } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'You are not a player in this game',
    })
  })

  it('returns 409 when replay is requested for a game that is not finished', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      status: 'abandoned',
    } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Replay is only available for finished games',
    })
  })

  it('returns decoded replay payload for players', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.game.id).toBe('game-1')
    expect(payload.game.endedAt).toBe('2026-02-27T18:10:00.000Z')
    expect(payload.game.durationMs).toBe(10 * 60 * 1000)
    expect(payload.replay.count).toBe(1)
    expect(payload.replay.snapshots[0].actionType).toBe('game:start')
    expect(payload.viewer).toEqual({ isPremium: true })
    expect(mockDecodeGameReplaySnapshots).toHaveBeenCalledTimes(1)
  })

  it('serves the replay to a player without Premium', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)
    mockPrisma.users.findUnique.mockResolvedValue({ premiumUntil: null } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()).viewer).toEqual({ isPremium: false })
  })

  it('keeps the download for Premium', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)
    mockPrisma.users.findUnique.mockResolvedValue({ premiumUntil: null } as any)

    const response = await GET(
      buildRequest('http://localhost:3000/api/game/game-1/replay?download=1'),
      { params: Promise.resolve({ gameId: 'game-1' }) }
    )

    expect(response.status).toBe(403)
  })

  it('asks for the players in seat order and returns each seat', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })
    const payload = await response.json()

    expect(mockPrisma.games.findUnique.mock.calls[0][0].include.players.orderBy).toEqual({ position: 'asc' })
    expect(payload.game.players.map((p: { position: number }) => p.position)).toEqual([0, 1])
  })

  it('strips what the server keeps to itself from every snapshot', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)
    mockPrisma.games.findUnique.mockResolvedValue({ ...mockGame, gameType: 'alias', lobby: { ...mockGame.lobby, gameType: 'alias' } } as any)
    mockDecodeGameReplaySnapshots.mockReturnValue([
      {
        id: 'snapshot-1',
        turnNumber: 0,
        playerId: 'user-1',
        actionType: 'game:start',
        actionPayload: null,
        state: { status: 'playing', data: { usedWordIndices: [1, 2], currentCard: ['castle'] } },
        createdAt: '2026-02-27T18:00:05.000Z',
      },
    ] as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })
    const payload = await response.json()

    expect(payload.replay.snapshots[0].state.data).toEqual({ usedWordIndices: [], currentCard: ['castle'] })
  })

  it('returns downloadable JSON when download=1 is set', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)

    const response = await GET(
      buildRequest('http://localhost:3000/api/game/game-1/replay?download=1'),
      {
        params: Promise.resolve({ gameId: 'game-1' }),
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('attachment;')
  })
})
