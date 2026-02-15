/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are intentionally lightweight for route tests.

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/lobby/route'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('GET /api/lobby', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('filters out stale waiting lobbies and bot-only lobbies', async () => {
    const now = new Date('2026-02-13T10:00:00.000Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(now)

    mockPrisma.lobbies.findMany.mockResolvedValue([
      {
        id: 'lobby-stale',
        code: 'OLD1',
        name: 'Stale Waiting',
        maxPlayers: 4,
        turnTimer: 60,
        isActive: true,
        gameType: 'yahtzee',
        createdAt: new Date('2026-02-13T08:00:00.000Z'),
        creatorId: 'user-1',
        password: null,
        creator: { username: 'owner1', email: 'owner1@example.com' },
        games: [
          {
            id: 'game-stale',
            status: 'waiting',
            updatedAt: new Date(now - 61 * 60 * 1000),
            _count: { players: 1 },
            players: [
              {
                user: { bot: null },
              },
            ],
          },
        ],
      },
      {
        id: 'lobby-bots',
        code: 'BOT1',
        name: 'Bots only',
        maxPlayers: 4,
        turnTimer: 60,
        isActive: true,
        gameType: 'yahtzee',
        createdAt: new Date('2026-02-13T08:10:00.000Z'),
        creatorId: 'user-2',
        password: null,
        creator: { username: 'owner2', email: 'owner2@example.com' },
        games: [
          {
            id: 'game-bots',
            status: 'waiting',
            updatedAt: new Date(now - 5 * 60 * 1000),
            _count: { players: 1 },
            players: [
              {
                user: { bot: { id: 'bot-1' } },
              },
            ],
          },
        ],
      },
      {
        id: 'lobby-valid',
        code: 'NEW1',
        name: 'Valid Waiting',
        maxPlayers: 4,
        turnTimer: 60,
        isActive: true,
        gameType: 'yahtzee',
        createdAt: new Date('2026-02-13T08:20:00.000Z'),
        creatorId: 'user-3',
        password: null,
        creator: { username: 'owner3', email: 'owner3@example.com' },
        games: [
          {
            id: 'game-valid',
            status: 'waiting',
            updatedAt: new Date(now - 5 * 60 * 1000),
            _count: { players: 2 },
            players: [
              {
                user: { bot: null },
              },
              {
                user: { bot: { id: 'bot-2' } },
              },
            ],
          },
        ],
      },
    ] as any)

    const req = new NextRequest('http://localhost:3000/api/lobby')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.lobbies).toHaveLength(1)
    expect(data.lobbies[0].code).toBe('NEW1')
    expect(data.stats.totalLobbies).toBe(1)
    expect(data.stats.waitingLobbies).toBe(1)
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
