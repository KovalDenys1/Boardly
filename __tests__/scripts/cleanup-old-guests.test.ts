import { prisma } from '@/lib/db'
import { cleanupOldGuests } from '@/scripts/cleanup-old-guests'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $disconnect: jest.fn(),
  },
}))

describe('cleanupOldGuests script', () => {
  const originalCleanupDays = process.env.CLEANUP_GUEST_DAYS

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.CLEANUP_GUEST_DAYS
  })

  afterAll(() => {
    if (typeof originalCleanupDays === 'string') {
      process.env.CLEANUP_GUEST_DAYS = originalCleanupDays
    } else {
      delete process.env.CLEANUP_GUEST_DAYS
    }
  })

  it('deletes guests older than configured retention days', async () => {
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'guest-1',
        username: 'Guest One',
        lastActiveAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])
    ;(prisma.users.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.users.count as jest.Mock).mockResolvedValueOnce(3).mockResolvedValueOnce(10)

    const result = await cleanupOldGuests({ days: 5, disconnect: false })

    expect(result).toEqual({ deleted: 1 })
    expect(prisma.users.deleteMany).toHaveBeenCalledTimes(1)
    const findArgs = (prisma.users.findMany as jest.Mock).mock.calls[0][0]
    expect(findArgs.where.lastActiveAt.lt).toBeInstanceOf(Date)
  })

  it('supports dry-run without deleting users', async () => {
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'guest-1',
        username: 'Guest One',
        lastActiveAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])

    const result = await cleanupOldGuests({ days: 3, dryRun: true, disconnect: false })

    expect(result).toEqual({ deleted: 0 })
    expect(prisma.users.deleteMany).not.toHaveBeenCalled()
  })

  it('falls back to default retention when env days value is invalid', async () => {
    process.env.CLEANUP_GUEST_DAYS = 'bad-value'
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])

    const before = Date.now()
    await cleanupOldGuests({ dryRun: true, disconnect: false })
    const after = Date.now()

    const findArgs = (prisma.users.findMany as jest.Mock).mock.calls[0][0]
    const cutoff = findArgs.where.lastActiveAt.lt as Date
    const cutoffMs = cutoff.getTime()

    // Roughly 3 days window from now with tolerance for test runtime.
    expect(cutoffMs).toBeGreaterThan(before - 4 * 24 * 60 * 60 * 1000)
    expect(cutoffMs).toBeLessThan(after - 2 * 24 * 60 * 60 * 1000)
  })
})
