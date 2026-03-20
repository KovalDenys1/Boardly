/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/game/[gameId]/results/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
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

describe('GET /api/game/[gameId]/results', () => {
  const mockGame = {
    id: 'game-1',
    state: { status: 'finished' },
    gameType: 'yahtzee',
    status: 'finished',
    createdAt: new Date('2026-02-27T18:00:00.000Z'),
    updatedAt: new Date('2026-02-27T18:10:00.000Z'),
    abandonedAt: null,
    _count: {
      snapshots: 12,
    },
    lobby: {
      code: 'ABCD12',
      name: 'Test Lobby',
      gameType: 'yahtzee',
    },
    players: [
      {
        userId: 'user-1',
        score: 200,
        finalScore: 220,
        placement: 1,
        isWinner: true,
        user: {
          id: 'user-1',
          username: 'User 1',
          image: 'https://example.com/u1.png',
          bot: null,
        },
      },
      {
        userId: 'user-2',
        score: 180,
        finalScore: 180,
        placement: 2,
        isWinner: false,
        user: {
          id: 'user-2',
          username: 'User 2',
          image: null,
          bot: null,
        },
      },
    ],
  }

  const buildRequest = (url = 'http://localhost:3000/api/game/game-1/results') =>
    new NextRequest(url, { method: 'GET' })

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.games.findUnique.mockResolvedValue(mockGame as any)
  })

  it('returns 401 when request is unauthorized', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns replay metadata together with match details for players', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.id).toBe('game-1')
    expect(payload.hasReplay).toBe(true)
    expect(payload.replayStepCount).toBe(12)
    expect(payload.players[0]).toEqual(
      expect.objectContaining({
        id: 'user-1',
        username: 'User 1',
        avatar: 'https://example.com/u1.png',
        isWinner: true,
      })
    )
  })
})
