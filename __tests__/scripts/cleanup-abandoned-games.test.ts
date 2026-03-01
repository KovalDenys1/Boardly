import { prisma } from '@/lib/db'
import { cleanupAbandonedGames } from '@/scripts/cleanup-abandoned-games'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    lobbies: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $disconnect: jest.fn(),
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

describe('cleanupAbandonedGames script', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses abandonedAt and legacy updatedAt fallback query filters', async () => {
    ;(prisma.games.findMany as jest.Mock).mockResolvedValue([])

    await cleanupAbandonedGames({ daysToKeep: 7, dryRun: true, disconnect: false })

    const findArgs = (prisma.games.findMany as jest.Mock).mock.calls[0][0]
    expect(findArgs.where.status).toBe('abandoned')
    expect(findArgs.where.OR).toEqual([
      { abandonedAt: { lt: expect.any(Date) } },
      { abandonedAt: null, updatedAt: { lt: expect.any(Date) } },
    ])
  })

  it('supports dry-run without deleting abandoned games', async () => {
    ;(prisma.games.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'game-1',
        lobbyId: 'lobby-1',
        abandonedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])

    const result = await cleanupAbandonedGames({ daysToKeep: 7, dryRun: true, disconnect: false })

    expect(result.candidates).toBe(1)
    expect(result.deletedGames).toBe(0)
    expect(result.deletedEmptyLobbies).toBe(0)
    expect(prisma.games.deleteMany).not.toHaveBeenCalled()
    expect(prisma.lobbies.deleteMany).not.toHaveBeenCalled()
  })

  it('deletes abandoned games and then cleans up empty inactive lobbies', async () => {
    ;(prisma.games.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'game-1',
        lobbyId: 'lobby-1',
        abandonedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])
    ;(prisma.games.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.lobbies.findMany as jest.Mock).mockResolvedValue([
      { id: 'lobby-1', code: 'ABC123' },
    ])
    ;(prisma.lobbies.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })

    const result = await cleanupAbandonedGames({ daysToKeep: 7, dryRun: false, disconnect: false })

    expect(result.deletedGames).toBe(1)
    expect(result.deletedEmptyLobbies).toBe(1)
    expect(prisma.games.deleteMany).toHaveBeenCalledTimes(1)
    expect(prisma.lobbies.deleteMany).toHaveBeenCalledTimes(1)
  })
})
