/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { POST } from '@/app/api/stripe/checkout/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { getStripe } from '@/lib/stripe'
import { TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    // The route records a checkout_started funnel row on the way out (#913). It is awaited
    // and its failure is swallowed, so the mock only has to exist for the route to finish.
    operationalEvents: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

let mockPremiumPriceId = 'price_live_valid'
let mockPremiumPriceIdYearly = 'price_live_valid_yearly'

jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
  get PREMIUM_PRICE_ID() {
    return mockPremiumPriceId
  },
  get PREMIUM_PRICE_ID_YEARLY() {
    return mockPremiumPriceIdYearly
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockGetStripe = getStripe as jest.MockedFunction<typeof getStripe>

function makeRequest(body?: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/stripe/checkout', {
    method: 'POST',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
}

/** What /premium sends once the box is ticked (#1162). */
function validConsent(overrides: Record<string, unknown> = {}) {
  return {
    termsVersion: TERMS_VERSION,
    withdrawalInfoVersion: WITHDRAWAL_INFO_VERSION,
    acceptedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** A purchase request: the plan if given, and a fresh consent. */
function buyRequest(plan?: string, consent: Record<string, unknown> = validConsent()) {
  return makeRequest({ ...(plan ? { plan } : {}), consent })
}

function freeUser() {
  mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
  mockPrisma.users.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'user@example.com',
    stripeCustomerId: 'cus_existing',
    premiumUntil: null,
  } as any)
}

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPremiumPriceId = 'price_live_valid'
    mockPremiumPriceIdYearly = 'price_live_valid_yearly'
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null as any)

    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
  })

  it('returns 502 with a clean message when Stripe rejects the configured price ID', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: 'cus_existing',
      premiumUntil: null,
    } as any)

    const badPriceError = new Stripe.errors.StripeInvalidRequestError({
      code: 'resource_missing',
      param: 'line_items[0][price]',
      message: "No such price: 'price_bad'",
      type: 'invalid_request_error',
    })
    mockGetStripe.mockReturnValue({
      checkout: { sessions: { create: jest.fn().mockRejectedValue(badPriceError) } },
    } as any)

    const response = await POST(buyRequest())
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload.error).toMatch(/temporarily unavailable/i)
    // Must not leak raw Stripe error internals (price ID, param path) to the client
    expect(JSON.stringify(payload)).not.toContain('price_bad')
  })

  it('returns 502 without calling Stripe when PREMIUM_PRICE_ID is unconfigured', async () => {
    mockPremiumPriceId = ''
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: 'cus_existing',
      premiumUntil: null,
    } as any)
    const createCheckoutSession = jest.fn()
    mockGetStripe.mockReturnValue({
      checkout: { sessions: { create: createCheckoutSession } },
    } as any)

    const response = await POST(buyRequest())
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload.error).toMatch(/temporarily unavailable/i)
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  it('recreates a stale Stripe customer and retries checkout session creation once', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: 'cus_stale',
      premiumUntil: null,
    } as any)
    mockPrisma.users.update.mockResolvedValue({} as any)

    const staleError = new Stripe.errors.StripeInvalidRequestError({
      code: 'resource_missing',
      param: 'customer',
      message: "No such customer: 'cus_stale'",
      type: 'invalid_request_error',
    })
    const createCustomer = jest.fn().mockResolvedValue({ id: 'cus_new' })
    const createCheckoutSession = jest
      .fn()
      .mockRejectedValueOnce(staleError)
      .mockResolvedValueOnce({ url: 'https://checkout.stripe.com/session-new' })

    mockGetStripe.mockReturnValue({
      customers: { create: createCustomer },
      checkout: { sessions: { create: createCheckoutSession } },
    } as any)

    const response = await POST(buyRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.url).toBe('https://checkout.stripe.com/session-new')
    expect(createCustomer).toHaveBeenCalledTimes(1)
    expect(createCheckoutSession).toHaveBeenCalledTimes(2)
    // The retry carries the same record of consent as the first attempt.
    expect(createCheckoutSession.mock.calls[1][0].metadata).toEqual(
      expect.objectContaining({ userId: 'user-1', consentTermsVersion: TERMS_VERSION })
    )
    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { stripeCustomerId: 'cus_new' },
    })
  })

  it('returns 502 (not an uncaught 500) if the retried checkout session creation also fails', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: 'cus_stale',
      premiumUntil: null,
    } as any)
    mockPrisma.users.update.mockResolvedValue({} as any)

    const staleError = new Stripe.errors.StripeInvalidRequestError({
      code: 'resource_missing',
      param: 'customer',
      message: "No such customer: 'cus_stale'",
      type: 'invalid_request_error',
    })
    const badPriceError = new Stripe.errors.StripeInvalidRequestError({
      code: 'resource_missing',
      param: 'line_items[0][price]',
      message: "No such price: 'price_bad'",
      type: 'invalid_request_error',
    })
    mockGetStripe.mockReturnValue({
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus_new' }) },
      checkout: {
        sessions: {
          create: jest.fn().mockRejectedValueOnce(staleError).mockRejectedValueOnce(badPriceError),
        },
      },
    } as any)

    const response = await POST(buyRequest())
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload.error).toMatch(/temporarily unavailable/i)
  })

  it('returns a checkout URL on success', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: 'cus_existing',
      premiumUntil: null,
    } as any)
    mockGetStripe.mockReturnValue({
      checkout: {
        sessions: { create: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session-1' }) },
      },
    } as any)

    const response = await POST(buyRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.url).toBe('https://checkout.stripe.com/session-1')
  })

  // #926: the plan decides the price ID, and no other purchase shape exists.
  describe('plan selection', () => {
    it('charges the monthly price when the body names no plan', async () => {
      freeUser()
      const create = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/s' })
      mockGetStripe.mockReturnValue({ checkout: { sessions: { create } } } as any)

      await POST(buyRequest())

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ line_items: [{ price: 'price_live_valid', quantity: 1 }] })
      )
    })

    it('charges the yearly price when the body asks for it', async () => {
      freeUser()
      const create = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/s' })
      mockGetStripe.mockReturnValue({ checkout: { sessions: { create } } } as any)

      const response = await POST(buyRequest('yearly'))

      expect(response.status).toBe(200)
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: [{ price: 'price_live_valid_yearly', quantity: 1 }],
          // The promotion code field is already on the payment page, so LAUNCH
          // needs no field of its own on /premium.
          allow_promotion_codes: true,
        })
      )
    })

    it('falls back to monthly for a plan that does not exist', async () => {
      freeUser()
      const create = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/s' })
      mockGetStripe.mockReturnValue({ checkout: { sessions: { create } } } as any)

      await POST(buyRequest('lifetime'))

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ line_items: [{ price: 'price_live_valid', quantity: 1 }] })
      )
    })

    it('refuses a yearly checkout rather than silently billing monthly when the yearly ID is unset', async () => {
      mockPremiumPriceIdYearly = ''
      freeUser()
      const create = jest.fn()
      mockGetStripe.mockReturnValue({ checkout: { sessions: { create } } } as any)

      const response = await POST(buyRequest('yearly'))

      expect(response.status).toBe(502)
      expect(create).not.toHaveBeenCalled()
    })

    it('records the plan on the checkout_started funnel row', async () => {
      freeUser()
      mockGetStripe.mockReturnValue({
        checkout: { sessions: { create: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/s' }) } },
      } as any)

      await POST(buyRequest('yearly'))

      expect(mockPrisma.operationalEvents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventName: 'checkout_started', payload: { plan: 'yearly' } }),
        })
      )
    })
  })

  // #1162: angrerettloven § 19. Premium starts inside the withdrawal period
  // only at the buyer's express request, so a checkout without one is refused.
  describe('consent', () => {
    function stripeThatSucceeds() {
      const create = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/s' })
      mockGetStripe.mockReturnValue({ checkout: { sessions: { create } } } as any)
      return create
    }

    it('answers 400 with a code the client can show when the body has no consent', async () => {
      freeUser()
      const create = stripeThatSucceeds()

      const response = await POST(makeRequest({ plan: 'yearly' }))
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload.code).toBe('consent_required')
      expect(create).not.toHaveBeenCalled()
      expect(mockPrisma.operationalEvents.create).not.toHaveBeenCalled()
    })

    it('refuses the old body-less POST for a free user', async () => {
      freeUser()
      const create = stripeThatSucceeds()

      const response = await POST(makeRequest())

      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('consent_required')
      expect(create).not.toHaveBeenCalled()
    })

    it('refuses a consent older than 24 hours', async () => {
      freeUser()
      const create = stripeThatSucceeds()
      const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

      const response = await POST(buyRequest('yearly', validConsent({ acceptedAt: stale })))

      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('consent_required')
      expect(create).not.toHaveBeenCalled()
    })

    it('refuses a consent given against another version of the terms', async () => {
      freeUser()
      const create = stripeThatSucceeds()

      const response = await POST(buyRequest('yearly', validConsent({ termsVersion: '2026-01-01' })))

      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('consent_required')
      expect(create).not.toHaveBeenCalled()
    })

    it('refuses a consent given against another version of the withdrawal information', async () => {
      freeUser()
      const create = stripeThatSucceeds()

      const response = await POST(
        buyRequest('yearly', validConsent({ withdrawalInfoVersion: '2026-01-01' }))
      )

      expect(response.status).toBe(400)
      expect(create).not.toHaveBeenCalled()
    })

    it('writes the consent onto the session and the subscription it creates', async () => {
      freeUser()
      const create = stripeThatSucceeds()
      const acceptedAt = new Date(Date.now() - 60 * 1000).toISOString()

      const response = await POST(buyRequest('yearly', validConsent({ acceptedAt })))

      expect(response.status).toBe(200)
      const expected = {
        userId: 'user-1',
        consentTermsVersion: TERMS_VERSION,
        consentWithdrawalInfoVersion: WITHDRAWAL_INFO_VERSION,
        consentAt: acceptedAt,
        consentReceivedAt: expect.any(String),
      }
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expected,
          subscription_data: { metadata: expected },
          // The payment page follows the browser's language, as the
          // withdrawal information did.
          locale: 'auto',
        })
      )
      // Not the Dashboard-side terms checkbox: it needs a Terms URL that is not set.
      expect(create.mock.calls[0][0]).not.toHaveProperty('consent_collection')
    })

    it('needs no consent to open the billing portal for someone already on Premium', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        stripeCustomerId: 'cus_existing',
        premiumUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      } as any)
      mockGetStripe.mockReturnValue({
        billingPortal: {
          sessions: { create: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/p' }) },
        },
      } as any)

      // The profile's "Manage subscription" button posts no body at all.
      const response = await POST(makeRequest())

      expect(response.status).toBe(200)
      expect((await response.json()).url).toBe('https://billing.stripe.com/p')
    })
  })

  it('returns 502 when the billing portal call fails with a non-stale Stripe error', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      stripeCustomerId: 'cus_existing',
      premiumUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    } as any)
    const permissionError = new Stripe.errors.StripePermissionError({
      code: 'account_invalid',
      message: 'This account cannot currently make live charges.',
      type: 'invalid_request_error',
    })
    mockGetStripe.mockReturnValue({
      billingPortal: { sessions: { create: jest.fn().mockRejectedValue(permissionError) } },
    } as any)

    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload.error).toMatch(/temporarily unavailable/i)
  })
})
