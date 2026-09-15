/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/stripe/webhook/route'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { updateMany: jest.fn() },
    stripeWebhookEvents: { create: jest.fn(), delete: jest.fn() },
  },
}))

jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

function subscriptionEvent(overrides = {}) {
  return {
    id: 'evt_1',
    type: 'customer.subscription.updated',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_new',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: 1893456000 }] },
        metadata: { userId: 'user_1' },
        ...overrides,
      },
    },
  }
}

// The route makes two kinds of write to Users. The entitlement write carries
// premiumUntil / stripeSubscriptionId and runs on every event, grant or revoke.
// The first-grant stamp is guarded by `premiumFirstGrantedAt: null` in its where
// clause, which is the whole mechanism that makes it once-only.
function updateCalls() {
  return prisma.users.updateMany.mock.calls.map(([args]) => args)
}

function stampCalls() {
  return updateCalls().filter((call) => 'premiumFirstGrantedAt' in call.where)
}

function entitlementCalls() {
  return updateCalls().filter((call) => !('premiumFirstGrantedAt' in call.where))
}

function request() {
  return new NextRequest('https://boardly.online/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: '{}',
  })
}

describe('POST /api/stripe/webhook — entitlement must never be silently dropped', () => {
  let event

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    event = subscriptionEvent()
    getStripe.mockReturnValue({
      webhooks: { constructEvent: jest.fn(() => event) },
      subscriptions: { retrieve: jest.fn() },
    })
    prisma.stripeWebhookEvents.create.mockResolvedValue({})
    prisma.stripeWebhookEvents.delete.mockResolvedValue({})
  })

  afterEach(() => jest.resetAllMocks())

  it('grants premium normally when the customer id matches a user', async () => {
    prisma.users.updateMany.mockResolvedValueOnce({ count: 1 })

    const res = await POST(request())

    expect(res.status).toBe(200)
    // One entitlement write, resolved straight from the customer id: the
    // metadata fallback must not fire when the id already matched.
    expect(entitlementCalls()).toHaveLength(1)
    expect(entitlementCalls()[0].where).toEqual({ stripeCustomerId: 'cus_new' })
  })

  it('recovers via subscription metadata when the stored customer id went stale', async () => {
    // Checkout recreates the Stripe customer when the stored id is stale, so
    // events for the new id match no row until we repair it.
    prisma.users.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })

    const res = await POST(request())

    expect(res.status).toBe(200)
    const repair = prisma.users.updateMany.mock.calls[1][0]
    expect(repair.where).toEqual({ id: 'user_1' })
    // The stored id is repaired so later events resolve directly.
    expect(repair.data.stripeCustomerId).toBe('cus_new')
    expect(repair.data.premiumUntil).toBeInstanceOf(Date)
    // The stamp follows the id that matched, not the event's customer id: that
    // id only resolves because the repair above just wrote it.
    expect(stampCalls()[0].where).toEqual({ id: 'user_1', premiumFirstGrantedAt: null })
  })

  it('returns 500 and releases the idempotency claim when no user can be resolved', async () => {
    prisma.users.updateMany.mockResolvedValue({ count: 0 })

    const res = await POST(request())

    // 200 here would tell Stripe the entitlement landed and burn the event id,
    // leaving a paying customer without Premium and no possible redelivery.
    expect(res.status).toBe(500)
    expect(prisma.stripeWebhookEvents.delete).toHaveBeenCalledWith({ where: { id: 'evt_1' } })
  })

  it('does not retry forever when a deleted subscription matches no user', async () => {
    event = subscriptionEvent()
    event.type = 'customer.subscription.deleted'
    prisma.users.updateMany.mockResolvedValue({ count: 0 })

    const res = await POST(request())

    // Nothing left to revoke, so retrying for days would never succeed.
    expect(res.status).toBe(200)
    expect(prisma.stripeWebhookEvents.delete).not.toHaveBeenCalled()
  })

  it('never revokes a live subscription when a superseded customer id is cancelled', async () => {
    // The regression this guards: the user already moved to a new Stripe
    // customer and is paying on a new subscription; the OLD customer's
    // subscription is cancelled later and its event still carries the same
    // metadata.userId. Recovering from metadata here would clear a live
    // entitlement and rewrite stripeCustomerId back to the dead id.
    event = subscriptionEvent()
    event.type = 'customer.subscription.deleted'
    prisma.users.updateMany.mockResolvedValue({ count: 0 })

    const res = await POST(request())

    expect(res.status).toBe(200)
    // Only the customer-id lookup ran; the metadata fallback must not fire.
    expect(prisma.users.updateMany).toHaveBeenCalledTimes(1)
  })

  it('stops retrying an orphaned event once a retry can no longer help', async () => {
    // A premium account deleted without cancelling its Stripe subscription
    // produces events that will never resolve. Retrying each for Stripe's full
    // window risks the endpoint being disabled for every customer.
    event = subscriptionEvent()
    event.created = Math.floor(Date.now() / 1000) - 60 * 60
    prisma.users.updateMany.mockResolvedValue({ count: 0 })

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.stripeWebhookEvents.delete).not.toHaveBeenCalled()
  })

  it('stamps premiumFirstGrantedAt on the first grant', async () => {
    prisma.users.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(stampCalls()).toHaveLength(1)
    expect(stampCalls()[0].where).toEqual({
      stripeCustomerId: 'cus_new',
      premiumFirstGrantedAt: null,
    })
    expect(stampCalls()[0].data.premiumFirstGrantedAt).toBeInstanceOf(Date)
  })

  it('does not move premiumFirstGrantedAt on a later grant', async () => {
    // A renewal is a grant like any other, and it must not rewrite the date the
    // account first converted. The guard is in the where clause, so the row that
    // already carries a stamp is not matched — the zero count here is Postgres
    // saying exactly that.
    prisma.users.updateMany
      .mockResolvedValueOnce({ count: 1 }) // entitlement extended
      .mockResolvedValueOnce({ count: 0 }) // stamp matched nothing: already set

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(stampCalls()).toHaveLength(1)
    expect(stampCalls()[0].where.premiumFirstGrantedAt).toBeNull()
    // The unguarded write runs on every event, so the column must never ride on it.
    expect(entitlementCalls().some((call) => 'premiumFirstGrantedAt' in call.data)).toBe(false)
  })

  it('keeps premiumFirstGrantedAt when a subscription is cancelled', async () => {
    // The point of the column: after churn, premiumUntil and
    // stripeSubscriptionId are gone and only this says the account ever paid.
    event = subscriptionEvent()
    event.type = 'customer.subscription.deleted'
    prisma.users.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(entitlementCalls()).toHaveLength(1)
    expect(entitlementCalls()[0].data.premiumUntil).toBeNull()
    expect(entitlementCalls()[0].data.stripeSubscriptionId).toBeNull()
    expect(entitlementCalls()[0].data).not.toHaveProperty('premiumFirstGrantedAt')
    // A revoke is not a conversion, so nothing may be stamped here either.
    expect(stampCalls()).toHaveLength(0)
  })

  it('ignores a duplicate delivery of an event already processed', async () => {
    prisma.stripeWebhookEvents.create.mockRejectedValueOnce(new Error('unique violation'))

    const res = await POST(request())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ duplicate: true })
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
  })
})
