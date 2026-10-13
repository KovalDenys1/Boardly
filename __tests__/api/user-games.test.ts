/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are intentionally lightweight for route tests.

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/user/games/route'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn() },
    games: { findMany: jest.fn(), count: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => async () => null,
}))

jest.mock('@/lib/session-user', () => ({
  requireSessionUser: jest.fn(async () => ({ session: { user: { id: 'me' } } })),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function game(overrides = {}) {
  return {
    id: 'g1',
    gameType: 'connect_four',
    status: 'finished',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:05:00Z'),
    abandonedAt: null,
    endedAt: new Date('2026-10-01T10:04:00Z'),
    durationSeconds: 240,
    terminalMetadata: { isDraw: false },
    lobby: { code: 'ABCD', name: 'Lobby' },
    _count: { snapshots: 12 },
    players: [
      { id: 'p1', userId: 'me', score: 1, finalScore: 1, placement: 1, isWinner: true, user: { id: 'me', username: 'Me', bot: null } },
      { id: 'p2', userId: 'bot', score: 0, finalScore: 0, placement: 2, isWinner: false, user: { id: 'bot', username: 'Robo', bot: { id: 'b' } } },
    ],
    ...overrides,
  }
}

const request = () => new NextRequest('http://localhost:3000/api/user/games?limit=20')

async function fetchGames(rows, total = rows.length, premium = false) {
  mockPrisma.users.findUnique.mockResolvedValue({ premiumUntil: premium ? new Date(Date.now() + 86400000) : null })
  mockPrisma.games.findMany.mockResolvedValue(rows)
  mockPrisma.games.count.mockResolvedValue(total)
  const response = await GET(request())
  expect(response.status).toBe(200)
  return response.json()
}

describe('GET /api/user/games', () => {
  beforeEach(() => jest.clearAllMocks())

  it('names the viewer result, the duration and each player’s user id', async () => {
    const payload = await fetchGames([game()])
    const [row] = payload.games

    expect(row.viewerResult).toBe('won')
    expect(row.durationMs).toBe(240_000)
    expect(row.players.map((p) => p.userId)).toEqual(['me', 'bot'])
    expect(row.players[1].isBot).toBe(true)
  })

  it('reads a loss, a draw, an abandoned and a running game', async () => {
    const payload = await fetchGames([
      game({ id: 'lost', players: [{ ...game().players[0], isWinner: false }, game().players[1]] }),
      game({ id: 'draw', terminalMetadata: { isDraw: true } }),
      game({ id: 'gone', status: 'abandoned', abandonedAt: new Date(), endedAt: null, durationSeconds: null }),
      game({ id: 'live', status: 'playing', endedAt: null, durationSeconds: null }),
    ])

    expect(payload.games.map((row) => row.viewerResult)).toEqual(['lost', 'draw', 'abandoned', 'inProgress'])
  })

  it('offers a replay only for a finished game that has snapshots', async () => {
    const payload = await fetchGames([
      game({ id: 'with' }),
      game({ id: 'without', _count: { snapshots: 0 } }),
      game({ id: 'running', status: 'playing' }),
    ])

    expect(payload.games.map((row) => row.hasReplay)).toEqual([true, false, false])
  })

  it('tells a free user how many games Premium would add', async () => {
    const payload = await fetchGames([game()], 53, false)

    expect(payload.pagination).toEqual(expect.objectContaining({ totalCount: 20, capped: true, hiddenCount: 33 }))
  })

  it('does not cap Premium', async () => {
    const payload = await fetchGames([game()], 53, true)

    expect(payload.pagination).toEqual(expect.objectContaining({ totalCount: 53, capped: false, hiddenCount: 0 }))
  })
})
