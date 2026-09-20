import { prisma } from '@/lib/db'
import {
  buildGuestCleanupWhere,
  cleanupOldGuests,
  resolvePlayedCleanupDays,
  DEFAULT_GUEST_CLEANUP_DAYS,
  PLAYED_GAME_STATUSES,
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
  /** Statuses of the Games this guest has a Players row on. */
  games: string[]
}

interface RelationFilter {
  game?: { status?: { in?: unknown } }
}

interface CleanupBranch {
  lastActiveAt?: { lt?: unknown }
  players?: { none?: RelationFilter; some?: RelationFilter }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

function playedStatusesOf(filter: RelationFilter | undefined): string[] {
  const statuses = filter?.game?.status?.in
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error(`relation filter must match a list of game statuses, got ${JSON.stringify(filter)}`)
  }
  return statuses as string[]
}

/**
 * Applies the script's where clause to a fixture the way Postgres would.
 *
 * It understands exactly the branch shape the script builds and throws on
 * anything else, so a rewritten clause fails the suite loudly instead of
 * quietly matching nothing and letting every assertion pass.
 *
 * The strictness is deliberate: the first version of this fix shipped a second
 * OR branch that carried no `players` filter at all, which silently capped
 * CLEANUP_GUEST_DAYS at the long window. A branch with no relation filter is
 * rejected here rather than evaluated.
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
    if (shape !== 'lastActiveAt,players') {
      throw new Error(`unrecognised cleanup branch: {${shape}} - every branch must carry a players filter`)
    }

    const cutoff = branch.lastActiveAt?.lt
    if (!(cutoff instanceof Date)) {
      throw new Error(`branch {${shape}} has no date cutoff`)
    }
    if (guest.lastActiveAt.getTime() >= cutoff.getTime()) {
      return false
    }

    const { none, some } = branch.players ?? {}
    if (none && !some) {
      const statuses = playedStatusesOf(none)
      return !guest.games.some((status) => statuses.includes(status))
    }
    if (some && !none) {
      const statuses = playedStatusesOf(some)
      return guest.games.some((status) => statuses.includes(status))
    }

    throw new Error(`unrecognised relation filter: ${JSON.stringify(branch.players)}`)
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

// The retention constants are the whole point of #1047, so they are pinned to
// literals here. Asserting `daysAgo(PLAYED_GUEST_CLEANUP_DAYS + 1)` against the
// imported constant proves nothing: it passes at 5 days (which re-opens the
// ticket) and at 36500 (which is the retention problem the fix set out to
// avoid). Changing either number must fail this file.
describe('guest retention constants', () => {
  it('keeps a guest who never played for 3 days', () => {
    expect(DEFAULT_GUEST_CLEANUP_DAYS).toBe(3)
  })

  it('keeps a guest who played for 90 days', () => {
    expect(PLAYED_GUEST_CLEANUP_DAYS).toBe(90)
  })

  it('counts playing, finished and abandoned games as having played', () => {
    expect([...PLAYED_GAME_STATUSES].sort()).toEqual(['abandoned', 'finished', 'playing'])
  })
})

// The operator knob is a floor on the long window, not a ceiling. Without this
// a CLEANUP_GUEST_DAYS above 90 kept the empty identities longer than the guests
// who had actually played.
describe('resolvePlayedCleanupDays', () => {
  it('holds the long window at 90 while the short window is below it', () => {
    expect(resolvePlayedCleanupDays(3)).toBe(90)
    expect(resolvePlayedCleanupDays(89)).toBe(90)
  })

  it('follows the short window once it is raised past 90', () => {
    expect(resolvePlayedCleanupDays(180)).toBe(180)
    expect(resolvePlayedCleanupDays(365)).toBe(365)
  })
})

// #1047: the short window deleted guests who had actually played, and Players
// cascades with the user, so a guest returning on day four had lost their
// history and counted as a new person.
describe('buildGuestCleanupWhere', () => {
  const shortCutoff = daysAgo(3)
  const longCutoff = daysAgo(90)
  const where = () => buildGuestCleanupWhere(shortCutoff, longCutoff)

  it('keeps a guest who finished a game past the short window', () => {
    expect(wouldDelete(where(), {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(4),
      games: ['finished'],
    })).toBe(false)
  })

  // The headline case of the ticket. lib/lobby-health.ts flips a stale `playing`
  // game to `abandoned` after 2 hours and lib/lobby-leave.ts abandons one the
  // moment the roster falls short, so the guest whose opponent closed the tab
  // never has a `finished` game to their name.
  it('keeps a guest whose only game was abandoned mid-play', () => {
    expect(wouldDelete(where(), {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(4),
      games: ['abandoned'],
    })).toBe(false)
  })

  it('keeps a guest whose game is still in progress', () => {
    expect(wouldDelete(where(), {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(4),
      games: ['playing'],
    })).toBe(false)
  })

  // A lobby that never started is the abandoned identity this job exists for.
  it('removes a guest whose games never left the lobby', () => {
    expect(wouldDelete(where(), {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(4),
      games: ['waiting', 'cancelled'],
    })).toBe(true)
  })

  it('removes a guest who played nothing at all once the short window passes', () => {
    expect(wouldDelete(where(), {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(4),
      games: [],
    })).toBe(true)

    // Still inside the short window: left alone.
    expect(wouldDelete(where(), {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(2),
      games: [],
    })).toBe(false)
  })

  it('removes a guest who played once the long window passes', () => {
    expect(wouldDelete(where(), {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(91),
      games: ['finished', 'abandoned', 'finished'],
    })).toBe(true)

    expect(wouldDelete(where(), {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(89),
      games: ['finished', 'abandoned', 'finished'],
    })).toBe(false)
  })
})

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
      games: [],
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

    await cleanupOldGuests({ dryRun: true, disconnect: false })
    const filter = cleanupFilter()

    // 3 days, not the 1 an unparsed value would have produced and not the 90 of
    // the long window.
    expect(wouldDelete(filter, { id: EMPTY_GUEST_ID, lastActiveAt: daysAgo(4), games: [] })).toBe(true)
    expect(wouldDelete(filter, { id: EMPTY_GUEST_ID, lastActiveAt: daysAgo(2), games: [] })).toBe(false)
  })

  it('lets CLEANUP_GUEST_DAYS shorten the window for guests who never played', async () => {
    process.env.CLEANUP_GUEST_DAYS = '1'
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])

    await cleanupOldGuests({ dryRun: true, disconnect: false })
    const filter = cleanupFilter()

    expect(wouldDelete(filter, {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(2),
      games: [],
    })).toBe(true)

    // Shortening it must not drag the long window down with it.
    expect(wouldDelete(filter, {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(89),
      games: ['finished'],
    })).toBe(false)
  })

  // The regression the review caught: the long window used to apply to every
  // guest, played or not, so raising CLEANUP_GUEST_DAYS past 90 did nothing for
  // anyone beyond day 90 while the docs line added alongside it promised no
  // ceiling at all.
  it('lets CLEANUP_GUEST_DAYS raise the window past the 90-day default', async () => {
    process.env.CLEANUP_GUEST_DAYS = '180'
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])

    await cleanupOldGuests({ dryRun: true, disconnect: false })
    const filter = cleanupFilter()

    expect(wouldDelete(filter, {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(100),
      games: [],
    })).toBe(false)

    expect(wouldDelete(filter, {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(100),
      games: ['finished'],
    })).toBe(false)

    // Past the raised window both are gone.
    expect(wouldDelete(filter, {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(181),
      games: [],
    })).toBe(true)

    expect(wouldDelete(filter, {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(181),
      games: ['finished'],
    })).toBe(true)
  })

  it('applies the same raise to the --days= CLI path', async () => {
    ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])

    await cleanupOldGuests({ days: 365, dryRun: true, disconnect: false })
    const filter = cleanupFilter()

    expect(wouldDelete(filter, {
      id: EMPTY_GUEST_ID,
      lastActiveAt: daysAgo(120),
      games: [],
    })).toBe(false)

    expect(wouldDelete(filter, {
      id: PLAYED_GUEST_ID,
      lastActiveAt: daysAgo(120),
      games: ['abandoned'],
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
