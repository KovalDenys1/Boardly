/**
 * The running-subscription notice (#1165, digitalytelsesloven § 33 fourth
 * paragraph): who is due, the once-only claim, and the release on a failed send.
 * Prisma is a small in-memory Users table, so the claim's compare-and-set is
 * exercised as a condition on the stored value, not as a call count.
 */
import type Stripe from 'stripe'

type Row = {
  id: string
  email: string | null
  username: string | null
  stripeSubscriptionId: string | null
  premiumCancelAtPeriod: boolean
  lastSubscriptionNoticeAt: Date | null
  missingStripeSubscriptionId: string | null
  purchaseConsents: { stripeSubscriptionId: string | null; consentReceivedAt: Date }[]
}

const table: Row[] = []

type Where = {
  id?: string
  stripeSubscriptionId?: string | null | { not: null }
  lastSubscriptionNoticeAt?: Date | null
}

function matches(row: Row, where: Where): boolean {
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.stripeSubscriptionId !== undefined && typeof where.stripeSubscriptionId === 'string') {
    if (row.stripeSubscriptionId !== where.stripeSubscriptionId) return false
  }
  if ('lastSubscriptionNoticeAt' in where) {
    const want = where.lastSubscriptionNoticeAt
    const have = row.lastSubscriptionNoticeAt
    if (want === null ? have !== null : have?.getTime() !== want?.getTime()) return false
  }
  return true
}

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findMany: jest.fn(async ({ where }: { where: { OR: [unknown, { lastSubscriptionNoticeAt: { lte: Date } }] } }) => {
        const cutoff = where.OR[1].lastSubscriptionNoticeAt.lte
        return table
          .filter((row) => row.stripeSubscriptionId !== null && !row.premiumCancelAtPeriod && row.email !== null)
          .filter((row) => row.lastSubscriptionNoticeAt === null || row.lastSubscriptionNoticeAt <= cutoff)
          .map((row) => ({ ...row }))
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        let count = 0
        for (const row of table) {
          if (matches(row, where)) {
            Object.assign(row, data)
            count += 1
          }
        }
        return { count }
      }),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/email', () => ({
  sendSubscriptionNoticeEmail: jest.fn(),
}))

import { noticeDueAt, sendDueSubscriptionNotices, SUBSCRIPTION_NOTICE_INTERVAL_DAYS } from '@/lib/subscription-notice'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2027-03-01T05:00:00Z')

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * DAY)
}

function subscription(overrides: Partial<Stripe.Subscription> & { startDaysAgo: number; interval?: 'month' | 'year' }): Stripe.Subscription {
  const { startDaysAgo, interval = 'year', ...rest } = overrides
  return {
    id: 'sub_1',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    start_date: Math.floor(daysBefore(startDaysAgo).getTime() / 1000),
    items: {
      data: [
        {
          current_period_end: Math.floor(new Date('2027-09-03T00:00:00Z').getTime() / 1000),
          price: { unit_amount: 2999, currency: 'usd', recurring: { interval } },
        },
      ],
    },
    ...rest,
  } as unknown as Stripe.Subscription
}

function addRow(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: `user_${table.length + 1}`,
    email: `buyer${table.length + 1}@example.com`,
    username: 'Ola',
    stripeSubscriptionId: 'sub_1',
    premiumCancelAtPeriod: false,
    lastSubscriptionNoticeAt: null,
    missingStripeSubscriptionId: null,
    purchaseConsents: [],
    ...overrides,
  }
  table.push(row)
  return row
}

const sendOk = jest.fn(async () => ({ success: true as const }))

describe('running-subscription notice (#1165)', () => {
  beforeEach(() => {
    table.length = 0
    sendOk.mockClear()
  })

  it('is due 170 days after the later of the start and the last notice, inside every six months', () => {
    expect(SUBSCRIPTION_NOTICE_INTERVAL_DAYS).toBeLessThan(181)
    const start = new Date('2026-09-03T00:00:00Z')
    expect(noticeDueAt(start, null)).toEqual(new Date('2027-02-20T00:00:00Z'))
    expect(noticeDueAt(start, new Date('2027-02-21T00:00:00Z'))).toEqual(new Date('2027-08-10T00:00:00Z'))
    // A notice from an older subscription does not hold back a newer one.
    expect(noticeDueAt(start, new Date('2026-01-01T00:00:00Z'))).toEqual(new Date('2027-02-20T00:00:00Z'))
  })

  it('sends a yearly subscriber the notice once it is due, with plan, price, renewal and the claim stored', async () => {
    const row = addRow()
    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () => subscription({ startDaysAgo: 179 }),
      sendEmail: sendOk,
    })

    expect(summary).toMatchObject({ candidates: 1, sent: 1, failed: 0 })
    expect(sendOk).toHaveBeenCalledWith(
      row.email,
      expect.objectContaining({
        username: 'Ola',
        plan: 'yearly',
        unitAmount: 2999,
        currency: 'usd',
        renewsAt: new Date('2027-09-03T00:00:00Z'),
        idempotencyKey: expect.stringMatching(/^subscription-notice\/user_1\/\d{4}-\d{2}-\d{2}$/),
      })
    )
    expect(row.lastSubscriptionNoticeAt).toEqual(NOW)
  })

  it('does nothing on a second run the same day: the claim is the record', async () => {
    addRow()
    const deps = {
      now: NOW,
      retrieveSubscription: async () => subscription({ startDaysAgo: 179 }),
      sendEmail: sendOk,
    }
    await sendDueSubscriptionNotices(deps)
    const second = await sendDueSubscriptionNotices(deps)

    expect(sendOk).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ candidates: 0, sent: 0 })
  })

  it('waits while the subscription is younger than the interval, by our record or by Stripe', async () => {
    const recorded = addRow({
      purchaseConsents: [{ stripeSubscriptionId: 'sub_1', consentReceivedAt: daysBefore(30) }],
    })
    const retrieve = jest.fn(async () => subscription({ startDaysAgo: 30 }))
    addRow({ stripeSubscriptionId: 'sub_2' })

    const summary = await sendDueSubscriptionNotices({ now: NOW, retrieveSubscription: retrieve, sendEmail: sendOk })

    expect(summary).toMatchObject({ candidates: 2, notDue: 2, sent: 0 })
    // Our own consent record answered for the first without a Stripe call.
    expect(retrieve).toHaveBeenCalledTimes(1)
    expect(retrieve).toHaveBeenCalledWith('sub_2')
    expect(recorded.lastSubscriptionNoticeAt).toBeNull()
  })

  it('skips a subscription that is ending or over, and leaves it unclaimed', async () => {
    const cancelling = addRow()
    const canceled = addRow({ stripeSubscriptionId: 'sub_2' })
    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async (id) =>
        id === 'sub_1'
          ? subscription({ startDaysAgo: 200, cancel_at_period_end: true })
          : subscription({ startDaysAgo: 200, status: 'canceled' }),
      sendEmail: sendOk,
    })

    expect(summary).toMatchObject({ notRunning: 2, sent: 0 })
    expect(sendOk).not.toHaveBeenCalled()
    expect(cancelling.lastSubscriptionNoticeAt).toBeNull()
    expect(canceled.lastSubscriptionNoticeAt).toBeNull()
  })

  it('treats a cancellation scheduled with cancel_at as ending', async () => {
    const row = addRow()
    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () =>
        subscription({ startDaysAgo: 200, cancel_at: Math.floor(new Date('2027-04-01T00:00:00Z').getTime() / 1000) }),
      sendEmail: sendOk,
    })
    expect(summary).toMatchObject({ notRunning: 1, sent: 0 })
    expect(row.lastSubscriptionNoticeAt).toBeNull()
  })

  it('skips a subscription Stripe no longer has, remembers it, and never asks again', async () => {
    const row = addRow()
    const gone = Object.assign(new Error("No such subscription: 'sub_1'"), { code: 'resource_missing', statusCode: 404 })
    const retrieve = jest.fn(async () => {
      throw gone
    })

    const first = await sendDueSubscriptionNotices({ now: NOW, retrieveSubscription: retrieve, sendEmail: sendOk })
    expect(first).toMatchObject({ missing: 1, failed: 0, sent: 0 })
    expect(row.missingStripeSubscriptionId).toBe('sub_1')
    expect(row.lastSubscriptionNoticeAt).toBeNull()

    const second = await sendDueSubscriptionNotices({ now: NOW, retrieveSubscription: retrieve, sendEmail: sendOk })
    expect(second).toMatchObject({ missing: 1, failed: 0 })
    expect(retrieve).toHaveBeenCalledTimes(1)

    // A new subscription stored by the webhook is noticed as usual.
    row.stripeSubscriptionId = 'sub_2'
    const third = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () => subscription({ id: 'sub_2', startDaysAgo: 200 }),
      sendEmail: sendOk,
    })
    expect(third).toMatchObject({ sent: 1, missing: 0 })
  })

  it('keeps a test/live mode mix-up a failure, so the alert fires instead of the id being written off', async () => {
    const row = addRow()
    const mixup = Object.assign(
      new Error("No such subscription: 'sub_1'; a similar object exists in test mode, but a live mode key was used to make this request."),
      { code: 'resource_missing' }
    )
    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () => {
        throw mixup
      },
      sendEmail: sendOk,
    })
    expect(summary).toMatchObject({ failed: 1, missing: 0 })
    expect(row.missingStripeSubscriptionId).toBeNull()
  })

  it('still notifies a past_due subscription: the contract has not ended', async () => {
    addRow()
    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () => subscription({ startDaysAgo: 200, status: 'past_due' }),
      sendEmail: sendOk,
    })
    expect(summary.sent).toBe(1)
  })

  it('releases the claim when the email fails, so tomorrow sends it', async () => {
    const previous = daysBefore(175)
    const row = addRow({ lastSubscriptionNoticeAt: previous })
    const sendFail = jest.fn(async () => ({ success: false as const, error: 'quota' }))

    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () => subscription({ startDaysAgo: 400, interval: 'month' }),
      sendEmail: sendFail,
    })

    expect(summary).toMatchObject({ sent: 0, failed: 1 })
    expect(row.lastSubscriptionNoticeAt).toEqual(previous)

    const tomorrow = new Date(NOW.getTime() + DAY)
    await sendDueSubscriptionNotices({
      now: tomorrow,
      retrieveSubscription: async () => subscription({ startDaysAgo: 401, interval: 'month' }),
      sendEmail: sendOk,
    })
    expect(sendOk).toHaveBeenCalledWith(row.email, expect.objectContaining({ plan: 'monthly' }))
    expect(row.lastSubscriptionNoticeAt).toEqual(tomorrow)
  })

  it('counts a Stripe read failure and claims nothing', async () => {
    const row = addRow()
    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () => {
        throw new Error('stripe down')
      },
      sendEmail: sendOk,
    })
    expect(summary).toMatchObject({ failed: 1, sent: 0 })
    expect(row.lastSubscriptionNoticeAt).toBeNull()
  })

  it('never sends twice when another run claimed the notice first', async () => {
    const row = addRow()
    const summary = await sendDueSubscriptionNotices({
      now: NOW,
      retrieveSubscription: async () => {
        // Another run claims between this run's read and its claim.
        row.lastSubscriptionNoticeAt = new Date(NOW.getTime() - 1000)
        return subscription({ startDaysAgo: 200 })
      },
      sendEmail: sendOk,
    })
    expect(summary.sent).toBe(0)
    expect(sendOk).not.toHaveBeenCalled()
  })
})
