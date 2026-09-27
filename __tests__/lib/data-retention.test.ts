// @ts-nocheck - prisma is a lightweight mock.
import { prisma } from '@/lib/db'
import {
  RETENTION_RULES,
  RETENTION_RULE_KEYS,
  enforceRetention,
  isRuleEnforced,
  resolveRetentionEnforceOverride,
} from '@/lib/data-retention'

const DELEGATES = {
  games: 'games',
  lobbies: 'lobbies',
  lobbyParticipations: 'lobbyParticipations',
  operationalEvents: 'operationalEvents',
  feedback: 'feedback',
  reports: 'reports',
  notifications: 'notifications',
  adminAuditLogs: 'adminAuditLogs',
}

jest.mock('@/lib/db', () => {
  const delegate = () => ({ count: jest.fn(), deleteMany: jest.fn() })
  return {
    prisma: {
      games: delegate(),
      lobbies: delegate(),
      lobbyParticipations: delegate(),
      operationalEvents: delegate(),
      feedback: delegate(),
      reports: delegate(),
      reportedDrawings: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      notifications: delegate(),
      adminAuditLogs: delegate(),
    },
  }
})

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

jest.mock('@/lib/feedback-discord', () => ({
  deleteFeedbackDiscordCopies: jest.fn(async () => ({ cleared: [], failed: [] })),
}))

jest.mock('@/lib/report-discord', () => ({
  deleteReportDiscordCopies: jest.fn(async () => ({ cleared: [], failed: [] })),
}))

jest.mock('@/lib/game-pseudonymisation', () => ({
  abandonedLobbiesWhere: jest.requireActual('@/lib/game-pseudonymisation').abandonedLobbiesWhere,
  countGamesToPseudonymise: jest.fn(async () => 6),
  countLobbiesToPseudonymise: jest.fn(async () => 2),
  pseudonymiseGames: jest.fn(async () => ({ pseudonymised: 5, snapshotsDeleted: 0 })),
  pseudonymiseLobbies: jest.fn(async () => 1),
}))

const NOW = new Date('2026-09-24T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('retention periods (#1130)', () => {
  it('covers every table the ticket lists', () => {
    expect(RETENTION_RULE_KEYS.sort()).toEqual(Object.keys(DELEGATES).sort())
  })

  it('keeps game history, lobbies, feedback, reports and notifications at least 12 months', () => {
    for (const key of ['games', 'lobbies', 'feedback', 'reports', 'notifications']) {
      expect(RETENTION_RULES[key].days).toBeGreaterThanOrEqual(365)
    }
  })

  it('keeps the Control Panel audit log at least 24 months', () => {
    expect(RETENTION_RULES.adminAuditLogs.days).toBeGreaterThanOrEqual(730)
  })
})

describe('RETENTION_ENFORCE', () => {
  it('overrides every rule when set, and defers to the rule when unset', () => {
    expect(resolveRetentionEnforceOverride('true')).toBe('enforce')
    expect(resolveRetentionEnforceOverride('false')).toBe('report')
    expect(resolveRetentionEnforceOverride(undefined)).toBeNull()
    expect(resolveRetentionEnforceOverride('maybe')).toBeNull()

    const offByDefault = { ...RETENTION_RULES.feedback, enforceByDefault: false }
    expect(isRuleEnforced(offByDefault, null)).toBe(false)
    expect(isRuleEnforced(offByDefault, 'enforce')).toBe(true)
    expect(isRuleEnforced(RETENTION_RULES.feedback, 'report')).toBe(false)
  })
})

describe('enforceRetention', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const name of Object.values(DELEGATES)) {
      prisma[name].count.mockResolvedValue(4)
      prisma[name].deleteMany.mockResolvedValue({ count: 3 })
    }
  })

  it('deletes rows past each period, measured from now', async () => {
    const result = await enforceRetention({ now: NOW, override: 'enforce' })

    expect(result.feedback).toMatchObject({ enforced: true, deleted: 3, matched: 3 })
    expect(prisma.feedback.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - 365 * DAY) } },
    })
    expect(prisma.operationalEvents.deleteMany).toHaveBeenCalledWith({
      where: { occurredAt: { lt: new Date(NOW.getTime() - 180 * DAY) } },
    })
    expect(prisma.adminAuditLogs.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - 730 * DAY) } },
    })
    for (const name of Object.values(DELEGATES)) {
      expect(prisma[name].count).not.toHaveBeenCalled()
    }
  })

  // Decision 2026-09-27: a finished game past its period is pseudonymised, never deleted,
  // so the statistics, leaderboard and achievements built on it survive.
  it('pseudonymises games instead of deleting them, and deletes only a lobby in which no game started', async () => {
    const { pseudonymiseGames, pseudonymiseLobbies } = jest.requireMock('@/lib/game-pseudonymisation')

    const result = await enforceRetention({ now: NOW, override: 'enforce' })

    expect(prisma.games.deleteMany).not.toHaveBeenCalled()
    const cutoff = new Date(NOW.getTime() - 365 * DAY)
    expect(pseudonymiseGames).toHaveBeenCalledWith(expect.objectContaining({ cutoff, now: NOW }))
    expect(result.games).toMatchObject({ enforced: true, deleted: 0, pseudonymised: 5, matched: 5 })

    // Every lobby is created with a game, so the delete branch is the one whose games were
    // all cancelled while waiting; they go with it.
    const lobbiesWhere = prisma.lobbies.deleteMany.mock.calls[0][0].where
    expect(lobbiesWhere).toEqual({
      isActive: false,
      createdAt: { lt: cutoff },
      games: { every: { status: 'cancelled' } },
    })
    expect(pseudonymiseLobbies).toHaveBeenCalledWith(cutoff, NOW)
    expect(result.lobbies).toMatchObject({ deleted: 3, pseudonymised: 1, matched: 4 })

    // Games go first, so a lobby whose last game was pseudonymised this run can follow.
    expect(pseudonymiseGames.mock.invocationCallOrder[0]).toBeLessThan(
      pseudonymiseLobbies.mock.invocationCallOrder[0]
    )
    // A rule that only deletes carries no pseudonymised count.
    expect(result.feedback.pseudonymised).toBeUndefined()
  })

  it('in report mode only counts', async () => {
    const { pseudonymiseGames, pseudonymiseLobbies } = jest.requireMock('@/lib/game-pseudonymisation')

    const result = await enforceRetention({ now: NOW, override: 'report' })

    for (const name of Object.values(DELEGATES)) {
      expect(prisma[name].deleteMany).not.toHaveBeenCalled()
    }
    expect(pseudonymiseGames).not.toHaveBeenCalled()
    expect(pseudonymiseLobbies).not.toHaveBeenCalled()
    expect(result.games).toMatchObject({ enforced: false, matched: 6, deleted: 0, pseudonymised: 0 })
    // Lobbies to delete (4) plus lobbies to rename (2).
    expect(result.lobbies).toMatchObject({ enforced: false, matched: 6 })
    expect(result.notifications).toMatchObject({ enforced: false, matched: 4, deleted: 0 })
  })

  it('deletes the Discord copy with the feedback row, and keeps a row whose copy Discord refused', async () => {
    const { deleteFeedbackDiscordCopies } = jest.requireMock('@/lib/feedback-discord')
    deleteFeedbackDiscordCopies.mockResolvedValueOnce({ cleared: ['f1'], failed: ['f2'] })

    await enforceRetention({ now: NOW, override: 'enforce' })

    const cutoff = new Date(NOW.getTime() - 365 * DAY)
    expect(deleteFeedbackDiscordCopies).toHaveBeenCalledWith({ createdAt: { lt: cutoff } })
    expect(prisma.feedback.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: cutoff }, id: { notIn: ['f2'] } },
    })
    expect(deleteFeedbackDiscordCopies.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.feedback.deleteMany.mock.invocationCallOrder[0]
    )
  })

  // #1172: a report's Discord notification quotes the reported content, so it goes with
  // the row, and a reported drawing goes once no report points at it any more.
  it('deletes the Discord copy with the report row, then the drawings no report needs', async () => {
    const { deleteReportDiscordCopies } = jest.requireMock('@/lib/report-discord')
    deleteReportDiscordCopies.mockResolvedValueOnce({ cleared: ['r1'], failed: ['r2'] })

    await enforceRetention({ now: NOW, override: 'enforce' })

    const cutoff = new Date(NOW.getTime() - 365 * DAY)
    expect(deleteReportDiscordCopies).toHaveBeenCalledWith({ createdAt: { lt: cutoff } })
    expect(prisma.reports.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: cutoff }, id: { notIn: ['r2'] } },
    })
    expect(prisma.reportedDrawings.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: cutoff }, reports: { none: {} } },
    })
    expect(deleteReportDiscordCopies.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.reports.deleteMany.mock.invocationCallOrder[0]
    )
    expect(prisma.reports.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.reportedDrawings.deleteMany.mock.invocationCallOrder[0]
    )
  })

  it('keeps going when one rule fails', async () => {
    jest.requireMock('@/lib/game-pseudonymisation').pseudonymiseGames.mockRejectedValueOnce(new Error('boom'))

    const result = await enforceRetention({ now: NOW, override: 'enforce' })

    expect(result.games.error).toBe('boom')
    expect(result.feedback.deleted).toBe(3)
  })
})
