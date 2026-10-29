/**
 * @jest-environment node
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { POST } from '@/app/api/stripe/webhook/route'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { sendPremiumConfirmationEmail } from '@/lib/email'

// Every payload below is a real event captured from the test-mode sandbox with
// `stripe listen --latest` at 2026-09-30.endive (#1322), ids anonymised, and delivered
// with a real signature through the real stripe-node webhook verification.

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { updateMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    stripeWebhookEvents: { create: jest.fn(), delete: jest.fn() },
    purchaseConsents: { upsert: jest.fn(), updateMany: jest.fn() },
  },
}))

jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
  PREMIUM_PRICE_ID_YEARLY: '',
}))

jest.mock('@/lib/email', () => ({
  sendPremiumConfirmationEmail: jest.fn(),
}))

jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), __log: log }
})

const mockLog = jest.requireMock('@/lib/logger').__log
const SECRET = 'whsec_fixture_endive'
const stripe = new Stripe('sk_test_fixture')

function payload(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', 'stripe-endive', `${name}.json`), 'utf8')
}

function objectOf(name: string) {
  return JSON.parse(payload(name)).data.object
}

function deliver(body: string, secret = SECRET) {
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret })
  return POST(
    new NextRequest('https://boardly.online/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body,
    })
  )
}

function entitlementCalls() {
  return prisma.users.updateMany.mock.calls
    .map(([args]) => args)
    .filter((call) => !('premiumFirstGrantedAt' in call.where))
}

function periodEnd(subscription) {
  return new Date(subscription.items.data[0].current_period_end * 1000)
}

const purchaser = { id: 'user_fixture_1', email: 'buyer@example.test', username: 'buyer', language: 'en' }

describe('POST /api/stripe/webhook – endive payloads captured from the sandbox', () => {
  let retrieve: jest.Mock

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET
    retrieve = jest.fn()
    getStripe.mockReturnValue({ webhooks: stripe.webhooks, subscriptions: { retrieve } })
    prisma.stripeWebhookEvents.create.mockResolvedValue({})
    prisma.stripeWebhookEvents.delete.mockResolvedValue({})
    prisma.users.updateMany.mockResolvedValue({ count: 1 })
    prisma.users.findUnique.mockResolvedValue(purchaser)
    prisma.purchaseConsents.upsert.mockResolvedValue({})
    prisma.purchaseConsents.updateMany.mockResolvedValue({ count: 1 })
    sendPremiumConfirmationEmail.mockResolvedValue({ success: true })
  })

  afterEach(() => jest.resetAllMocks())

  it.each([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'checkout.session.completed',
    'checkout.session.completed.unpaid',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'customer.subscription.created.sepa',
  ])('%s is an endive payload', (name) => {
    expect(JSON.parse(payload(name)).api_version).toMatch(/\.endive$/)
  })

  it('customer.subscription.created grants Premium until the item period end', async () => {
    const body = payload('customer.subscription.created')
    const event = JSON.parse(body)
    const sub = event.data.object

    const res = await deliver(body)

    expect(res.status).toBe(200)
    expect(prisma.stripeWebhookEvents.create).toHaveBeenCalledWith({ data: { id: event.id, type: event.type } })
    expect(entitlementCalls()).toEqual([
      {
        where: { stripeCustomerId: sub.customer },
        data: { premiumUntil: periodEnd(sub), stripeSubscriptionId: sub.id, premiumCancelAtPeriod: false },
      },
    ])
  })

  it('customer.subscription.updated after a cancel keeps Premium to the period end and records the cancel', async () => {
    const sub = objectOf('customer.subscription.updated')
    expect(sub.cancel_at_period_end).toBe(true)

    const res = await deliver(payload('customer.subscription.updated'))

    expect(res.status).toBe(200)
    expect(entitlementCalls()).toEqual([
      {
        where: { stripeCustomerId: sub.customer },
        data: { premiumUntil: periodEnd(sub), stripeSubscriptionId: sub.id, premiumCancelAtPeriod: true },
      },
    ])
  })

  it('customer.subscription.deleted revokes Premium and forgets the subscription', async () => {
    const sub = objectOf('customer.subscription.deleted')

    const res = await deliver(payload('customer.subscription.deleted'))

    expect(res.status).toBe(200)
    expect(entitlementCalls()).toEqual([
      {
        where: { stripeCustomerId: sub.customer },
        data: { premiumUntil: null, stripeSubscriptionId: null, premiumCancelAtPeriod: false },
      },
    ])
  })

  it('checkout.session.completed, paid, grants from the re-read subscription, records the consent and confirms once', async () => {
    const session = objectOf('checkout.session.completed')
    const sub = objectOf('customer.subscription.created')
    retrieve.mockResolvedValue(sub)

    const res = await deliver(payload('checkout.session.completed'))

    expect(res.status).toBe(200)
    expect(retrieve).toHaveBeenCalledWith(session.subscription)
    expect(entitlementCalls()[0]).toEqual({
      where: { stripeCustomerId: session.customer },
      data: { premiumUntil: periodEnd(sub), stripeSubscriptionId: session.subscription, premiumCancelAtPeriod: false },
    })
    expect(prisma.purchaseConsents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { checkoutSessionId: session.id },
        create: expect.objectContaining({
          checkoutSessionId: session.id,
          stripeSubscriptionId: sub.id,
          plan: 'monthly',
          termsVersion: session.metadata.consentTermsVersion,
          withdrawalInfoVersion: session.metadata.consentWithdrawalInfoVersion,
          consentAt: new Date(session.metadata.consentAt),
        }),
      })
    )
    expect(sendPremiumConfirmationEmail).toHaveBeenCalledTimes(1)
    expect(sendPremiumConfirmationEmail).toHaveBeenCalledWith(
      purchaser.email,
      expect.objectContaining({
        idempotencyKey: `purchase-confirmation:${session.id}`,
        plan: 'monthly',
        amountTotal: session.amount_total,
        currency: session.currency,
        renewsAt: periodEnd(sub),
      })
    )
  })

  it('checkout.session.completed, unpaid, records the consent and grants and sends nothing', async () => {
    const session = objectOf('checkout.session.completed.unpaid')
    expect(session.payment_status).toBe('unpaid')
    retrieve.mockResolvedValue(objectOf('customer.subscription.created.sepa'))

    const res = await deliver(payload('checkout.session.completed.unpaid'))

    expect(res.status).toBe(200)
    expect(entitlementCalls()).toEqual([])
    expect(prisma.purchaseConsents.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { checkoutSessionId: session.id } })
    )
    expect(sendPremiumConfirmationEmail).not.toHaveBeenCalled()
  })

  it('checkout.session.async_payment_succeeded grants and confirms the session that was pending', async () => {
    const session = objectOf('checkout.session.async_payment_succeeded')
    const sub = objectOf('customer.subscription.created.sepa')
    retrieve.mockResolvedValue(sub)

    const res = await deliver(payload('checkout.session.async_payment_succeeded'))

    expect(res.status).toBe(200)
    expect(retrieve).toHaveBeenCalledWith(session.subscription)
    expect(entitlementCalls()[0]).toEqual({
      where: { stripeCustomerId: session.customer },
      data: { premiumUntil: periodEnd(sub), stripeSubscriptionId: session.subscription, premiumCancelAtPeriod: false },
    })
    expect(sendPremiumConfirmationEmail).toHaveBeenCalledWith(
      purchaser.email,
      expect.objectContaining({ amountTotal: session.amount_total, currency: session.currency })
    )
  })

  it('checkout.session.async_payment_failed changes no entitlement and sends nothing', async () => {
    const session = objectOf('checkout.session.async_payment_failed')

    const res = await deliver(payload('checkout.session.async_payment_failed'))

    expect(res.status).toBe(200)
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
    expect(sendPremiumConfirmationEmail).not.toHaveBeenCalled()
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Checkout payment failed after completion',
      expect.objectContaining({ checkoutSessionId: session.id, subscriptionId: session.subscription })
    )
  })

  it('refuses an endive payload signed with another secret before claiming or touching anything', async () => {
    const res = await deliver(payload('customer.subscription.created'), 'whsec_someone_else')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid signature' })
    expect(prisma.stripeWebhookEvents.create).not.toHaveBeenCalled()
    expect(prisma.users.updateMany).not.toHaveBeenCalled()
  })
})
