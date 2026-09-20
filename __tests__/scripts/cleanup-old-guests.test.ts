import { prisma } from '@/lib/db'
import {
  cleanupOldGuests,
  DEFAULT_GUEST_CLEANUP_DAYS,
  PLAYED_GUEST_CLEANUP_DAYS,
} from '@/scripts/cleanup-old-guests'

const DAY_MS = 24 * 60 * 60 * 1000

// Guest ids are `guest-<uuid>` (createGuestId in lib/guest-auth.ts), never
// cuids: the row is always created with an explicit id, so the cuid default on
// Users.id never fires for a guest.
const PLAYED_GUEST_ID = 'guest-8f14e45f-ceea-467a-9a3b-1c2d3e4f5a6b'
const EMPTY_GUEST_ID = 'guest-2c1a7b90-4d55-4e0f-8b71-0a9c8d7e6f54'

interface GuestFixture {
  id: string
  lastActiveAt: Date
  finishedGames: number
}

interface CleanupBranch {
  lastActiveAt?: { lt?: unknown }
  players?: { none?: { game?: { status?: unknown } } }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

/**
 * Applies the script's where clause to a fixture the way Postgres would.
 *
 * It understands exactly the two branch shapes the script builds and throws on
 * anything else, so a rewritten clause fails the suite loudly instead of
 * quietly matching nothing and letting every assertion pass.
 */
function wouldDelete(where: unknown, guest: GuestFixture): boolean {
  const clause = where as { isGuest?: unknown; OR?: unknown }

  if (clause?.isGuest !== true) {
    throw new Error(`cleanup filter must be scoped to guests, got ${JSON.stringify(clause)}`)
  }
  if (!Array.isArray(clause.OR) || clause.OR.length === 0) {
    throw new Error(`cleanup filter must be a list of OR branches, got ${JSON.stringify(clause)}`)
  }

  return (clause.OR as CleanupBranch[]).some((branch) => {
    const shape = Object.keys(branch).sort().join(',')
    if (shape !== 'lastActiveAt' && shape !== 'lastActiveAt,players') {
      throw new Error(`unrecognised cleanup branch: {${shape}}`)
    }

    const cutoff = branch.lastActiveAt?.lt
    if (!(cutoff instanceof Date)) {
      throw new Error(`branch {${shape}} has no date cutoff`)
    }
    if (guest.lastActiveAt.getTime() >= cutoff.getTime()) {
      return false
    }

    if (!branch.players) {
      return true
    }
    if (branch.players.none?.game?.status !== 'finished') {
      throw new Error(`unrecognised relation filter: ${JSON.stringify(branch.players)}`)
    }
    return guest.finishedGames === 0
  })
}

function cleanupFilter(): unknown {
  const calls = (prisma.users.findMany as jest.Mock).mock.calls
  expect(calls).toHaveLength(1)
  return calls[0][0].where
}

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
    expect(wouldDelete(cleanupFilter(), {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(6),
      finishedGames: 0,
    })).toBe(true)
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

    const branches = (cleanupFilter() as { OR: CleanupBranch[] }).OR
    const cutoff = branches[0].lastActiveAt?.lt as Date
    const cutoffMs = cutoff.getTime()

    // Roughly 3 days window from now with tolerance for test runtime.
    expect(cutoffMs).toBeGreaterThan(before - 4 * 24 * 60 * 60 * 1000)
    expect(cutoffMs).toBeLessThan(after - 2 * 24 * 60 * 60 * 1000)
  })

  // #1047: the short window deleted guests who had actually played, and
  // Players cascades with the user, so a guest returning on day four had lost
  // their history and counted as a new person.
  describe('retention policy', () => {
    beforeEach(() => {
      ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])
    })

    it('keeps a guest who finished a game past the short window', async () => {
      await cleanupOldGuests({ dryRun: true, disconnect: false })

      expect(wouldDelete(cleanupFilter(), {
        id: PLAYED_GUEST_ID,
        lastActiveAt: daysAgo(DEFAULT_GUEST_CLEANUP_DAYS + 1),
        finishedGames: 1,
      })).toBe(false)
    })

    it('removes a guest who finished nothing once the short window passes', async () => {
      await cleanupOldGuests({ dryRun: true, disconnect: false })
      const filter = cleanupFilter()

      expect(wouldDelete(filter, {
        id: EMPTY_GUEST_ID,
        lastActiveAt: daysAgo(DEFAULT_GUEST_CLEANUP_DAYS + 1),
        finishedGames: 0,
      })).toBe(true)

      // Still inside the window: left alone.
      expect(wouldDelete(filter, {
        id: EMPTY_GUEST_ID,
        lastActiveAt: daysAgo(DEFAULT_GUEST_CLEANUP_DAYS - 1),
        finishedGames: 0,
      })).toBe(false)
    })

    it('removes a guest who played once the long window passes', async () => {
      await cleanupOldGuests({ dryRun: true, disconnect: false })
      const filter = cleanupFilter()

      expect(wouldDelete(filter, {
        id: PLAYED_GUEST_ID,
        lastActiveAt: daysAgo(PLAYED_GUEST_CLEANUP_DAYS + 1),
        finishedGames: 3,
      })).toBe(true)

      expect(wouldDelete(filter, {
        id: PLAYED_GUEST_ID,
        lastActiveAt: daysAgo(PLAYED_GUEST_CLEANUP_DAYS - 1),
        finishedGames: 3,
      })).toBe(false)
    })

    it('lets CLEANUP_GUEST_DAYS move the short window without touching the long one', async () => {
      process.env.CLEANUP_GUEST_DAYS = '1'

      await cleanupOldGuests({ dryRun: true, disconnect: false })
      const filter = cleanupFilter()

      // Short window now 1 day.
      expect(wouldDelete(filter, {
        id: EMPTY_GUEST_ID,
        lastActiveAt: daysAgo(2),
        finishedGames: 0,
      })).toBe(true)

      // The long window is a constant and ignores the override.
      expect(wouldDelete(filter, {
        id: PLAYED_GUEST_ID,
        lastActiveAt: daysAgo(PLAYED_GUEST_CLEANUP_DAYS - 1),
        finishedGames: 2,
      })).toBe(false)
    })

    it('deletes exactly the set it listed', async () => {
      ;(prisma.users.findMany as jest.Mock).mockResolvedValue([
        {
          id: EMPTY_GUEST_ID,
          username: 'Guest One',
          lastActiveAt: daysAgo(9),
          createdAt: daysAgo(12),
        },
      ])
      ;(prisma.users.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(prisma.users.count as jest.Mock).mockResolvedValueOnce(3).mockResolvedValueOnce(10)

      await cleanupOldGuests({ disconnect: false })

      const deleteArgs = (prisma.users.deleteMany as jest.Mock).mock.calls[0][0]
      expect(deleteArgs.where).toEqual(cleanupFilter())
    })
  })
})
