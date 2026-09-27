// @ts-nocheck - prisma is a lightweight mock.
import { prisma } from '@/lib/db'
import {
  enforceInactiveAccounts,
  inactiveAccountRuleWhere,
  inactiveDeletionDate,
  inactivityCutoffs,
} from '@/lib/inactive-accounts'

jest.mock('@/lib/db', () => ({
  prisma: { users: { findMany: jest.fn(), updateMany: jest.fn() } },
}))
jest.mock('@/lib/email', () => ({ sendInactiveAccountWarningEmail: jest.fn() }))
jest.mock('@/lib/account-deletion', () => ({ deleteUserAccount: jest.fn() }))
jest.mock('@/lib/game-pseudonymisation', () => ({}))
jest.mock('@/lib/feedback-discord', () => ({}))
jest.mock('@/lib/report-discord', () => ({}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2028-01-10T03:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

const account = (id: string, lastActiveDaysAgo: number, warnedDaysAgo: number | null = null) => ({
  id,
  email: `${id}@example.com`,
  username: id,
  lastActiveAt: daysAgo(lastActiveDaysAgo),
  inactivityWarningSentAt: warnedDaysAgo === null ? null : daysAgo(warnedDaysAgo),
})

/** The two reads the run makes: deletion candidates first, then warning candidates. */
function candidates(forDeletion: unknown[], forWarning: unknown[]) {
  prisma.users.findMany.mockResolvedValueOnce(forDeletion).mockResolvedValueOnce(forWarning)
}

describe('inactive accounts (#1130)', () => {
  let sendEmail: jest.Mock
  let deleteAccount: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.users.findMany.mockReset()
    sendEmail = jest.fn().mockResolvedValue({ success: true })
    deleteAccount = jest.fn().mockResolvedValue({ status: 'deleted' })
    prisma.users.updateMany.mockResolvedValue({ count: 1 })
  })

  const run = (overrides = {}) =>
    enforceInactiveAccounts({ now: NOW, override: null, sendEmail, deleteAccount, ...overrides })

  it('covers registered people only, never a bot, an admin, a customer or an address-less account', () => {
    const where = inactiveAccountRuleWhere(NOW)
    expect(where.AND[0]).toEqual({
      isGuest: false,
      bot: null,
      role: 'user',
      premiumFirstGrantedAt: null,
      email: { not: null },
    })
    // The unverified purge's own rule: no subscription, no paid time, no customer, no checkout.
    expect(where.AND[1]).toMatchObject({
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      purchaseConsents: { none: {} },
      OR: [{ premiumUntil: null }, { premiumUntil: { lte: NOW } }],
    })
  })

  it('warns 30 days before 24 months, and deletes at 24 months', () => {
    const { warnCutoff, deleteCutoff } = inactivityCutoffs(NOW)
    expect(deleteCutoff).toEqual(daysAgo(730))
    expect(warnCutoff).toEqual(daysAgo(700))
  })

  it('names 24 months after the last activity, but never less than 30 days away', () => {
    expect(inactiveDeletionDate(daysAgo(690), NOW)).toEqual(new Date(daysAgo(690).getTime() + 730 * DAY))
    // A warning sent late (the cron missed days) still gives the full 30 days.
    expect(inactiveDeletionDate(daysAgo(705), NOW)).toEqual(new Date(NOW.getTime() + 30 * DAY))
    expect(inactiveDeletionDate(daysAgo(900), NOW)).toEqual(new Date(NOW.getTime() + 30 * DAY))
  })

  it('claims, then sends one warning per inactive stretch', async () => {
    candidates([], [
      account('fresh', 705),
      account('warned', 710, 5),
      // Came back after an old warning, then went quiet again: a new stretch, a new warning.
      account('returned', 702, 800),
    ])

    const result = await run()

    expect(result).toMatchObject({ enforced: true, warnDue: 2, warned: 2, warnFailed: 0 })
    expect(sendEmail.mock.calls.map((call) => call[0])).toEqual(['fresh@example.com', 'returned@example.com'])
    const [, first] = sendEmail.mock.calls[0]
    expect(first.deleteOn).toEqual(new Date(NOW.getTime() + 30 * DAY))
    expect(first.idempotencyKey).toBe(`inactive-account-warning/fresh/${daysAgo(705).toISOString().slice(0, 10)}`)

    // The claim is a compare-and-set on both values the run read.
    expect(prisma.users.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'fresh', lastActiveAt: daysAgo(705), inactivityWarningSentAt: null },
      data: { inactivityWarningSentAt: NOW },
    })
    expect(prisma.users.updateMany.mock.invocationCallOrder[0]).toBeLessThan(sendEmail.mock.invocationCallOrder[0])
  })

  it('sends nothing when another run holds the claim', async () => {
    candidates([], [account('fresh', 705)])
    prisma.users.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await run()

    expect(sendEmail).not.toHaveBeenCalled()
    expect(result.warned).toBe(0)
  })

  it('puts the claim back when the email fails, so no deletion counts from a warning never sent', async () => {
    candidates([], [account('fresh', 705)])
    sendEmail.mockResolvedValueOnce({ success: false, error: 'quota' })

    const result = await run()

    expect(result).toMatchObject({ warned: 0, warnFailed: 1 })
    expect(prisma.users.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 'fresh', inactivityWarningSentAt: NOW },
      data: { inactivityWarningSentAt: null },
    })
  })

  it('deletes only an account warned at least 30 days ago, after its last activity, through the shared path', async () => {
    candidates(
      [
        account('due', 740, 31),
        account('too-soon', 740, 29),
        // Warned, then signed in, then quiet: that warning no longer counts.
        account('stale-warning', 735, 800),
      ],
      []
    )

    const result = await run()

    expect(result).toMatchObject({ deleteDue: 1, deleted: 1, deleteFailed: 0 })
    expect(deleteAccount).toHaveBeenCalledTimes(1)
    const [id, options] = deleteAccount.mock.calls[0]
    expect(id).toBe('due')
    expect(options.reason).toBe('inactivity')
    // The delete is pinned to what this run read, so a sign-in in between keeps the account.
    expect(options.guard.AND).toEqual(
      expect.arrayContaining([{ lastActiveAt: daysAgo(740) }, { inactivityWarningSentAt: daysAgo(31) }])
    )
    expect(options.guard.AND[0]).toEqual(inactiveAccountRuleWhere(NOW))
  })

  it('counts a refused or failed deletion and carries on', async () => {
    candidates([account('a', 740, 31), account('b', 741, 31), account('c', 742, 31)], [])
    deleteAccount
      .mockResolvedValueOnce({ status: 'avatar_failed' })
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ status: 'deleted' })

    const result = await run()

    expect(result).toMatchObject({ deleteDue: 3, deleted: 1, deleteFailed: 2 })
  })

  it('in report mode only counts: no email, no claim, no deletion', async () => {
    candidates([account('due', 740, 31)], [account('fresh', 705)])

    const result = await run({ override: 'report' })

    expect(result).toMatchObject({ enforced: false, warnDue: 1, deleteDue: 1, warned: 0, deleted: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(deleteAccount).not.toHaveBeenCalled()
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
  })

  it('follows RETENTION_ENFORCE=false like the table rules', async () => {
    const previous = process.env.RETENTION_ENFORCE
    process.env.RETENTION_ENFORCE = 'false'
    try {
      candidates([], [account('fresh', 705)])
      const result = await enforceInactiveAccounts({ now: NOW, sendEmail, deleteAccount })
      expect(result.enforced).toBe(false)
      expect(sendEmail).not.toHaveBeenCalled()
    } finally {
      if (previous === undefined) delete process.env.RETENTION_ENFORCE
      else process.env.RETENTION_ENFORCE = previous
    }
  })

  it('respects the per-run caps', async () => {
    candidates(
      [account('d1', 740, 31), account('d2', 740, 31)],
      [account('w1', 705), account('w2', 705), account('w3', 705)]
    )

    const result = await run({ maxDeletions: 1, maxWarnings: 2 })

    expect(result).toMatchObject({ deleted: 1, warned: 2, deleteDue: 2, warnDue: 3 })
  })
})
