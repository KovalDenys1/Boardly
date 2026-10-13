import { prisma } from '@/lib/db'
import { cleanupOldReplaySnapshots, cleanupOversizedReplaySnapshots } from '@/lib/cleanup-replays'

jest.mock('@/lib/db', () => ({
  prisma: {
    gameStateSnapshots: {
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

describe('cleanupOldReplaySnapshots', () => {
  const originalRetentionDays = process.env.REPLAY_RETENTION_DAYS

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    if (typeof originalRetentionDays === 'string') {
      process.env.REPLAY_RETENTION_DAYS = originalRetentionDays
    } else {
      delete process.env.REPLAY_RETENTION_DAYS
    }
  })

  it('deletes replay snapshots with explicit retention days', async () => {
    ;(prisma.gameStateSnapshots.deleteMany as jest.Mock).mockResolvedValue({ count: 4 })

    const result = await cleanupOldReplaySnapshots(30)

    expect(result.deleted).toBe(4)
    expect(result.retentionDays).toBe(30)
    const queryArgs = (prisma.gameStateSnapshots.deleteMany as jest.Mock).mock.calls[0][0]
    expect(queryArgs.where.game.status.in).toEqual(['finished', 'abandoned', 'cancelled'])
    expect(queryArgs.where.createdAt.lt).toBeInstanceOf(Date)
  })

  it('clamps invalid days to minimum 1 day', async () => {
    ;(prisma.gameStateSnapshots.deleteMany as jest.Mock).mockResolvedValue({ count: 0 })

    const result = await cleanupOldReplaySnapshots(-5)

    expect(result.retentionDays).toBe(1)
  })

  it('uses default retention when env value is invalid', async () => {
    process.env.REPLAY_RETENTION_DAYS = 'invalid'
    ;(prisma.gameStateSnapshots.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })

    const result = await cleanupOldReplaySnapshots()

    expect(result.retentionDays).toBe(90)
    expect(result.deleted).toBe(1)
  })
})

describe('cleanupOversizedReplaySnapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes snapshots beyond the per-game cap for affected games only, keeping the first', async () => {
    ;(prisma.gameStateSnapshots.groupBy as jest.Mock).mockResolvedValue([
      { gameId: 'game-1', _count: { id: 501 } },
    ])
    ;(prisma.gameStateSnapshots.findFirst as jest.Mock).mockResolvedValue({ id: 'snapshot-start' })
    ;(prisma.gameStateSnapshots.findMany as jest.Mock).mockResolvedValue([
      { id: 'snapshot-old' },
      { id: 'snapshot-start' },
    ])
    ;(prisma.gameStateSnapshots.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })

    const result = await cleanupOversizedReplaySnapshots()

    expect(result.deletedSnapshots).toBe(1)
    expect(result.affectedGames).toBe(1)
    const findManyArgs = (prisma.gameStateSnapshots.findMany as jest.Mock).mock.calls[0][0]
    expect(findManyArgs.where.gameId).toBe('game-1')
    expect(findManyArgs.skip).toBe(499)
    expect(prisma.gameStateSnapshots.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['snapshot-old'] } },
    })
  })

  it('leaves a game alone when only its first snapshot is past the cap', async () => {
    ;(prisma.gameStateSnapshots.groupBy as jest.Mock).mockResolvedValue([
      { gameId: 'game-1', _count: { id: 500 } },
    ])
    ;(prisma.gameStateSnapshots.findFirst as jest.Mock).mockResolvedValue({ id: 'snapshot-start' })
    ;(prisma.gameStateSnapshots.findMany as jest.Mock).mockResolvedValue([{ id: 'snapshot-start' }])

    const result = await cleanupOversizedReplaySnapshots()

    expect(result.deletedSnapshots).toBe(0)
    expect(prisma.gameStateSnapshots.deleteMany).not.toHaveBeenCalled()
  })

  it('does nothing when no game exceeds the cap', async () => {
    ;(prisma.gameStateSnapshots.groupBy as jest.Mock).mockResolvedValue([])

    const result = await cleanupOversizedReplaySnapshots()

    expect(result.deletedSnapshots).toBe(0)
    expect(result.affectedGames).toBe(0)
    expect(prisma.gameStateSnapshots.findMany).not.toHaveBeenCalled()
    expect(prisma.gameStateSnapshots.deleteMany).not.toHaveBeenCalled()
  })
})
