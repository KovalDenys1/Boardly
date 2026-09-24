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
      notifications: delegate(),
      adminAuditLogs: delegate(),
    },
  }
})

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const NOW = new Date('2026-09-24T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('retention periods (#1130)', () => {
  it('covers every table the ticket lists', () => {
    expect(RETENTION_RULE_KEYS.sort()).toEqual(Object.keys(DELEGATES).sort())
  })

  it('keeps game history, lobbies, feedback and notifications at least 12 months', () => {
    for (const key of ['games', 'lobbies', 'feedback', 'notifications']) {
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

  it('never deletes a game that is still running, and never a lobby that still holds a game', async () => {
    await enforceRetention({ now: NOW, override: 'enforce' })

    const gamesWhere = prisma.games.deleteMany.mock.calls[0][0].where
    expect(gamesWhere.status.in.sort()).toEqual(['abandoned', 'cancelled', 'finished'])

    const lobbiesWhere = prisma.lobbies.deleteMany.mock.calls[0][0].where
    expect(lobbiesWhere).toMatchObject({ isActive: false, games: { none: {} } })

    // Games go first so a lobby emptied this run can follow in the same run.
    const gamesOrder = prisma.games.deleteMany.mock.invocationCallOrder[0]
    const lobbiesOrder = prisma.lobbies.deleteMany.mock.invocationCallOrder[0]
    expect(gamesOrder).toBeLessThan(lobbiesOrder)
  })

  it('in report mode only counts', async () => {
    const result = await enforceRetention({ now: NOW, override: 'report' })

    for (const name of Object.values(DELEGATES)) {
      expect(prisma[name].deleteMany).not.toHaveBeenCalled()
    }
    expect(result.notifications).toMatchObject({ enforced: false, matched: 4, deleted: 0 })
  })

  it('keeps going when one rule fails', async () => {
    prisma.games.deleteMany.mockRejectedValue(new Error('boom'))

    const result = await enforceRetention({ now: NOW, override: 'enforce' })

    expect(result.games.error).toBe('boom')
    expect(result.feedback.deleted).toBe(3)
  })
})
