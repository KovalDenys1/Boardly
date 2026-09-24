/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/stripe/webhook/route'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { sendPremiumConfirmationEmail } from '@/lib/email'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { updateMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    stripeWebhookEvents: { create: jest.fn(), delete: jest.fn() },
    purchaseConsents: { upsert: jest.fn(), updateMany: jest.fn() },
  },
}))

jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
  PREMIUM_PRICE_ID_YEARLY: 'price_yearly',
}))

jest.mock('@/lib/email', () => ({
  sendPremiumConfirmationEmail: jest.fn(),
}))

// One logger object for the whole module, so the warnings the route emits can
// be asserted on. It is created inside the factory because jest.mock is
// hoisted above every declaration in this file, and the route's imports call
// apiLogger() while the module graph is still loading.
jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), __log: log }
})

const mockLog = jest.requireMock('@/lib/logger').__log

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

// ---------------------------------------------------------------------------
// checkout.session.completed: the record of the sale and its confirmation (#1164)
// ---------------------------------------------------------------------------

const CONSENT = {
  userId: 'user_1',
  consentTermsVersion: '2026-09-24',
  consentWithdrawalInfoVersion: '2026-09-24',
  consentAt: '2026-09-24T14:00:00.000Z',
  consentReceivedAt: '2026-09-24T14:00:02.000Z',
}

function checkoutEvent(session = {}) {
  return {
    id: 'evt_cs_1',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_1',
        mode: 'subscription',
        subscription: 'sub_1',
        customer: 'cus_new',
        amount_total: 299,
        currency: 'usd',
        currency_conversion: null,
        metadata: { ...CONSENT },
        ...session,
      },
    },
  }
}

function subscription(overrides = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_new',
    status: 'active',
    cancel_at_period_end: false,
    currency: 'usd',
    items: { data: [{ current_period_end: 1893456000, price: { id: 'price_monthly', unit_amount: 299 } }] },
    metadata: { ...CONSENT },
    ...overrides,
  }
}

const PURCHASER = { id: 'user_1', email: 'buyer@example.com', username: 'Ola' }

function consentWrites() {
  return prisma.purchaseConsents.updateMany.mock.calls.map(([args]) => args)
}

describe('POST /api/stripe/webhook - checkout.session.completed records the consent and confirms once', () => {
  let event
  let retrieve

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    event = checkoutEvent()
    retrieve = jest.fn().mockResolvedValue(subscription())
    getStripe.mockReturnValue({
      webhooks: { constructEvent: jest.fn(() => event) },
      subscriptions: { retrieve },
    })
    prisma.stripeWebhookEvents.create.mockResolvedValue({})
    prisma.stripeWebhookEvents.delete.mockResolvedValue({})
    prisma.users.updateMany.mockResolvedValue({ count: 1 })
    prisma.users.findUnique.mockResolvedValue(PURCHASER)
    prisma.users.findFirst.mockResolvedValue(null)
    prisma.purchaseConsents.upsert.mockResolvedValue({})
    prisma.purchaseConsents.updateMany.mockResolvedValue({ count: 1 })
    sendPremiumConfirmationEmail.mockResolvedValue({ success: true })
  })

  afterEach(() => jest.resetAllMocks())

  it('upserts the consent row from the session metadata and sends one confirmation to the buyer', async () => {
    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.purchaseConsents.upsert).toHaveBeenCalledTimes(1)
    const [{ where, create, update }] = prisma.purchaseConsents.upsert.mock.calls[0]
    expect(where).toEqual({ checkoutSessionId: 'cs_1' })
    expect(create).toEqual({
      checkoutSessionId: 'cs_1',
      userId: 'user_1',
      stripeSubscriptionId: 'sub_1',
      plan: 'monthly',
      termsVersion: '2026-09-24',
      withdrawalInfoVersion: '2026-09-24',
      consentAt: new Date('2026-09-24T14:00:00.000Z'),
      consentReceivedAt: new Date('2026-09-24T14:00:02.000Z'),
    })
    // A redelivery rewrites the same values; the claim column is never on the payload.
    expect(update).not.toHaveProperty('confirmationSentAt')
    expect(create).not.toHaveProperty('confirmationSentAt')

    expect(sendPremiumConfirmationEmail).toHaveBeenCalledTimes(1)
    const [to, details] = sendPremiumConfirmationEmail.mock.calls[0]
    expect(to).toBe('buyer@example.com')
    expect(details).toEqual({
      idempotencyKey: 'purchase-confirmation:cs_1',
      username: 'Ola',
      plan: 'monthly',
      amountTotal: 299,
      currency: 'usd',
      convertedFrom: null,
      renewsAt: new Date(1893456000 * 1000),
      consentAt: new Date('2026-09-24T14:00:00.000Z'),
      termsVersion: '2026-09-24',
    })
  })

  it('resolves the buyer by the customer id, not by the metadata, when both exist', async () => {
    await POST(request())

    expect(prisma.users.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.users.findUnique.mock.calls[0][0].where).toEqual({ stripeCustomerId: 'cus_new' })
  })

  it('falls back to the metadata userId when the customer id resolves no row', async () => {
    prisma.users.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(PURCHASER)

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.users.findUnique.mock.calls[1][0].where).toEqual({ id: 'user_1' })
    expect(sendPremiumConfirmationEmail).toHaveBeenCalledTimes(1)
  })

  it('reads the plan off the billed price and passes the converted source amount', async () => {
    event = checkoutEvent({
      amount_total: 3290,
      currency: 'nok',
      currency_conversion: { amount_subtotal: 299, amount_total: 299, fx_rate: '11.0', source_currency: 'usd' },
    })
    retrieve.mockResolvedValue(
      subscription({
        currency: 'nok',
        items: { data: [{ current_period_end: 1893456000, price: { id: 'price_yearly', unit_amount: 3290 } }] },
      })
    )

    await POST(request())

    expect(prisma.purchaseConsents.upsert.mock.calls[0][0].create.plan).toBe('yearly')
    const details = sendPremiumConfirmationEmail.mock.calls[0][1]
    expect(details.plan).toBe('yearly')
    expect(details.amountTotal).toBe(3290)
    expect(details.currency).toBe('nok')
    expect(details.convertedFrom).toEqual({ amountTotal: 299, currency: 'usd' })
  })

  it('sends only once when the same session is delivered twice', async () => {
    // The event ledger normally stops a redelivery before this code runs. This
    // is the case where it did not (the claim had been released by an earlier
    // failure, or a second event for the same session arrives): the row-level
    // claim on confirmationSentAt is what still keeps it to one email.
    prisma.purchaseConsents.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    expect((await POST(request())).status).toBe(200)
    expect((await POST(request())).status).toBe(200)

    expect(prisma.purchaseConsents.upsert).toHaveBeenCalledTimes(2)
    expect(sendPremiumConfirmationEmail).toHaveBeenCalledTimes(1)
  })

  it('claims before it sends, and never sends without a claim of exactly one row', async () => {
    await POST(request())

    const claim = prisma.purchaseConsents.updateMany.mock.calls[0][0]
    expect(claim).toEqual({
      where: { checkoutSessionId: 'cs_1', confirmationSentAt: null },
      data: { confirmationSentAt: expect.any(Date) },
    })
    // Order of operations: upsert, then claim, then send. A send before the
    // claim could go out twice; a claim after the send could not be undone.
    const upsertAt = prisma.purchaseConsents.upsert.mock.invocationCallOrder[0]
    const claimAt = prisma.purchaseConsents.updateMany.mock.invocationCallOrder[0]
    const sendAt = sendPremiumConfirmationEmail.mock.invocationCallOrder[0]
    expect(upsertAt).toBeLessThan(claimAt)
    expect(claimAt).toBeLessThan(sendAt)
  })

  it('releases the claim and throws on a fresh event so Stripe redelivers when the send fails', async () => {
    sendPremiumConfirmationEmail.mockResolvedValue({ success: false, error: 'Resend is down' })

    const res = await POST(request())

    // 500 with the ledger claim released: Stripe redelivers, the entitlement
    // and the record are idempotent, the released claim lets the retry send once.
    expect(res.status).toBe(500)
    expect(prisma.stripeWebhookEvents.delete).toHaveBeenCalled()
    expect(consentWrites()).toHaveLength(2)
    expect(consentWrites()[1]).toEqual({
      where: { checkoutSessionId: 'cs_1' },
      data: { confirmationSentAt: null },
    })
    expect(mockLog.error).toHaveBeenCalledWith(
      'failed to send purchase confirmation',
      undefined,
      expect.objectContaining({ checkoutSessionId: 'cs_1', error: 'Resend is down' })
    )
  })

  it('treats a throwing send like a failed one', async () => {
    sendPremiumConfirmationEmail.mockRejectedValue(new Error('socket hang up'))

    const res = await POST(request())

    expect(res.status).toBe(500)
    expect(consentWrites()[1]).toEqual({
      where: { checkoutSessionId: 'cs_1' },
      data: { confirmationSentAt: null },
    })
  })

  it('only logs a failed send once the event is too old for Stripe to retry', async () => {
    sendPremiumConfirmationEmail.mockResolvedValue({ success: false, error: 'Resend is down' })
    event.created = Math.floor(Date.now() / 1000) - 60 * 60

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.stripeWebhookEvents.delete).not.toHaveBeenCalled()
    expect(consentWrites()[1]).toEqual({
      where: { checkoutSessionId: 'cs_1' },
      data: { confirmationSentAt: null },
    })
  })

  it('passes a per-session idempotency key to the email', async () => {
    await POST(request())

    expect(sendPremiumConfirmationEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ idempotencyKey: 'purchase-confirmation:cs_1' })
    )
  })

  it('does not release the claim after a successful send, whatever else fails later', async () => {
    await POST(request())

    // Exactly one write to the claim column: the claim itself.
    expect(consentWrites()).toHaveLength(1)
    expect(consentWrites()[0].where).toEqual({ checkoutSessionId: 'cs_1', confirmationSentAt: null })
  })

  it('grants Premium but records nothing for a session created before consent was collected', async () => {
    event = checkoutEvent({ metadata: {} })
    retrieve.mockResolvedValue(subscription({ metadata: { userId: 'user_1' } }))

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(entitlementCalls()).toHaveLength(1)
    expect(prisma.purchaseConsents.upsert).not.toHaveBeenCalled()
    expect(prisma.purchaseConsents.updateMany).not.toHaveBeenCalled()
    expect(sendPremiumConfirmationEmail).not.toHaveBeenCalled()
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Checkout session without consent metadata',
      expect.objectContaining({ checkoutSessionId: 'cs_1', customerId: 'cus_new' })
    )
  })

  it('falls back to the subscription metadata when the session carries none', async () => {
    event = checkoutEvent({ metadata: null })

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.purchaseConsents.upsert).toHaveBeenCalledTimes(1)
    expect(sendPremiumConfirmationEmail).toHaveBeenCalledTimes(1)
  })

  it('records nothing and sends nothing when the entitlement could not be granted', async () => {
    prisma.users.updateMany.mockResolvedValue({ count: 0 })

    const res = await POST(request())

    expect(res.status).toBe(500)
    expect(prisma.purchaseConsents.upsert).not.toHaveBeenCalled()
    expect(sendPremiumConfirmationEmail).not.toHaveBeenCalled()
  })

  it('leaves the row unconfirmed and sends nothing when the buyer has no email address', async () => {
    prisma.users.findUnique.mockResolvedValue({ ...PURCHASER, email: null })

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.purchaseConsents.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.purchaseConsents.updateMany).not.toHaveBeenCalled()
    expect(sendPremiumConfirmationEmail).not.toHaveBeenCalled()
  })

  it('lets a young event retry when the row cannot be written, before anything is sent', async () => {
    prisma.purchaseConsents.upsert.mockRejectedValue(new Error('connection reset'))

    const res = await POST(request())

    // Nothing has gone out, every earlier step is idempotent, so a redelivery
    // is the cheapest way to get the legally required record written.
    expect(res.status).toBe(500)
    expect(prisma.stripeWebhookEvents.delete).toHaveBeenCalledWith({ where: { id: 'evt_cs_1' } })
    expect(sendPremiumConfirmationEmail).not.toHaveBeenCalled()
  })

  it('stops retrying a row write once the event is too old for a retry to help', async () => {
    event = checkoutEvent()
    event.created = Math.floor(Date.now() / 1000) - 60 * 60
    prisma.purchaseConsents.upsert.mockRejectedValue(new Error('connection reset'))

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.stripeWebhookEvents.delete).not.toHaveBeenCalled()
    expect(mockLog.error).toHaveBeenCalledWith(
      'failed to record purchase consent',
      expect.any(Error),
      expect.objectContaining({ checkoutSessionId: 'cs_1' })
    )
  })
})
