import { prisma } from '@/lib/db'
import { cleanupOldReplaySnapshots } from '@/lib/cleanup-replays'

jest.mock('@/lib/db', () => ({
  prisma: {
    gameStateSnapshots: {
      deleteMany: jest.fn(),
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
