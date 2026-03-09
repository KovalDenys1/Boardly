/**
 * @jest-environment node
 */
// @ts-nocheck

import { NextRequest } from 'next/server'

jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/admin-auth', () => ({
  isAdminUser: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
  rateLimitPresets: {
    api: {},
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

import { GET } from '@/app/api/user/[id]/stats/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { isAdminUser } from '@/lib/admin-auth'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockIsAdminUser = isAdminUser as jest.MockedFunction<typeof isAdminUser>

describe('GET /api/user/[id]/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAdminUser.mockResolvedValue(false)
  })

  it('returns 401 when the requester is not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/user/user-1/stats'),
      { params: Promise.resolve({ id: 'user-1' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized')
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns 403 when requesting another user without admin access', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'requester-1' },
    } as any)
    mockIsAdminUser.mockResolvedValue(false)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/user/user-2/stats'),
      { params: Promise.resolve({ id: 'user-2' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe('Forbidden')
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid date range', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    } as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/user/user-1/stats?from=2026-02-10&to=2026-01-01'),
      { params: Promise.resolve({ id: 'user-1' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('`from` must be less than or equal to `to`')
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns aggregated stats without loading full game rows into memory', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    } as any)

    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        {
          totalGames: 4,
          wins: 1,
          losses: 1,
          draws: 1,
          avgGameDurationMinutes: 15,
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          gameType: 'yahtzee',
          gamesPlayed: 2,
          wins: 1,
          losses: 1,
          draws: 0,
          avgScore: 100,
          bestScore: 120,
          lastPlayed: new Date('2026-01-02T11:20:00.000Z'),
        },
        {
          gameType: 'tic_tac_toe',
          gamesPlayed: 1,
          wins: 0,
          losses: 0,
          draws: 1,
          avgScore: 0,
          bestScore: 0,
          lastPlayed: new Date('2026-01-03T12:05:00.000Z'),
        },
        {
          gameType: 'guess_the_spy',
          gamesPlayed: 1,
          wins: 0,
          losses: 0,
          draws: 0,
          avgScore: 0,
          bestScore: 0,
          lastPlayed: new Date('2026-01-04T13:25:00.000Z'),
        },
      ] as any)
      .mockResolvedValueOnce([
        { date: '2026-01-01', gamesPlayed: 1, wins: 1 },
        { date: '2026-01-02', gamesPlayed: 1, wins: 0 },
        { date: '2026-01-03', gamesPlayed: 1, wins: 0 },
        { date: '2026-01-04', gamesPlayed: 1, wins: 0 },
      ] as any)
      .mockResolvedValueOnce([
        { currentWinStreak: 0, longestWinStreak: 1 },
      ] as any)

    const response = await GET(
      new NextRequest('http://localhost:3000/api/user/user-1/stats?from=2026-01-01&to=2026-01-31'),
      { params: Promise.resolve({ id: 'user-1' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Stats-Cache')).toBe('bypass')
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(4)
    expect(payload).toMatchObject({
      userId: 'user-1',
      overall: {
        totalGames: 4,
        wins: 1,
        losses: 1,
        draws: 1,
        winRate: 33.3,
        avgGameDurationMinutes: 15,
        favoriteGame: 'yahtzee',
        currentWinStreak: 0,
        longestWinStreak: 1,
      },
      byGame: expect.arrayContaining([
        expect.objectContaining({
          gameType: 'yahtzee',
          gamesPlayed: 2,
          wins: 1,
          losses: 1,
          draws: 0,
          winRate: 50,
          avgScore: 100,
          bestScore: 120,
        }),
      ]),
      trends: expect.arrayContaining([
        expect.objectContaining({ date: '2026-01-01', gamesPlayed: 1, wins: 1 }),
        expect.objectContaining({ date: '2026-01-02', gamesPlayed: 1, wins: 0 }),
      ]),
      dateRange: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T23:59:59.999Z',
      },
    })
    expect(typeof payload.generatedAt).toBe('string')
  })
})
