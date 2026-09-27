/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { GET as GET_PURCHASES } from '@/app/api/user/purchases/route'
import { GET as GET_RENEWAL } from '@/app/api/user/purchases/renewal/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getStripe } from '@/lib/stripe'
import {
  __premiumPricingTestUtils,
  getSubscriptionRenewal,
  RENEWAL_CACHE_TTL_MS,
  RENEWAL_FAILURE_CACHE_TTL_MS,
} from '@/lib/server/premium-pricing'
import { parsePremiumRenewal } from '@/lib/premium-plans'

jest.mock('@/lib/db', () => ({
  prisma: { users: { findUnique: jest.fn() } },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
  PREMIUM_PRICE_ID: 'price_monthly',
  PREMIUM_PRICE_ID_YEARLY: 'price_yearly',
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockFindUnique = prisma.users.findUnique as jest.Mock
const mockGetRequestAuthUser = getRequestAuthUser as jest.Mock
const mockGetStripe = getStripe as jest.Mock
const retrieveSubscription = jest.fn()

function subscriptionOn(unitAmount: number | null, currency: string, interval: string, intervalCount = 1) {
  return {
    items: {
      data: [{ price: { unit_amount: unitAmount, currency, recurring: { interval, interval_count: intervalCount } } }],
    },
  }
}

const IN_A_MONTH = new Date(Date.now() + 30 * 86_400_000)
const renewingUser = { premiumUntil: IN_A_MONTH, stripeSubscriptionId: 'sub_1', premiumCancelAtPeriod: false }

describe('the renewal price on the profile (#1167)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    __premiumPricingTestUtils.clearRenewalCache()
    mockGetStripe.mockReturnValue({ subscriptions: { retrieve: retrieveSubscription } })
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('getSubscriptionRenewal', () => {
    it('reads the plan and the list price off the subscription, with one try and a 3 s deadline', async () => {
      retrieveSubscription.mockResolvedValue(subscriptionOn(299, 'usd', 'month'))

      await expect(getSubscriptionRenewal('sub_1')).resolves.toEqual({ plan: 'monthly', price: '$2.99' })
      expect(retrieveSubscription).toHaveBeenCalledWith('sub_1', {}, { timeout: 3000, maxNetworkRetries: 0 })
    })

    it('reports a yearly subscription as yearly, at its own price', async () => {
      retrieveSubscription.mockResolvedValue(subscriptionOn(2499, 'usd', 'year'))

      await expect(getSubscriptionRenewal('sub_1')).resolves.toEqual({ plan: 'yearly', price: '$24.99' })
    })

    it.each([
      ['Stripe cannot be reached', () => retrieveSubscription.mockRejectedValue(new Error('offline'))],
      ['the Price has no amount', () => retrieveSubscription.mockResolvedValue(subscriptionOn(null, 'usd', 'month'))],
      ['the period is neither a month nor a year', () => retrieveSubscription.mockResolvedValue(subscriptionOn(99, 'usd', 'week'))],
      ['the period is every three months', () => retrieveSubscription.mockResolvedValue(subscriptionOn(799, 'usd', 'month', 3))],
    ])('shows no price rather than a wrong one when %s', async (_label, arrange) => {
      arrange()
      await expect(getSubscriptionRenewal('sub_1')).resolves.toBeNull()
    })

    it('asks Stripe once per subscription for five minutes', async () => {
      let now = 1_800_000_000_000
      jest.spyOn(Date, 'now').mockImplementation(() => now)
      retrieveSubscription.mockResolvedValue(subscriptionOn(299, 'usd', 'month'))

      await getSubscriptionRenewal('sub_1')
      now += RENEWAL_CACHE_TTL_MS - 1
      await expect(getSubscriptionRenewal('sub_1')).resolves.toEqual({ plan: 'monthly', price: '$2.99' })
      expect(retrieveSubscription).toHaveBeenCalledTimes(1)

      // Another subscription is its own entry.
      await getSubscriptionRenewal('sub_2')
      expect(retrieveSubscription).toHaveBeenCalledTimes(2)

      now += 1
      await getSubscriptionRenewal('sub_1')
      expect(retrieveSubscription).toHaveBeenCalledTimes(3)
    })

    it('remembers a failure for a minute, so an outage is not asked on every page view', async () => {
      let now = 1_800_000_000_000
      jest.spyOn(Date, 'now').mockImplementation(() => now)
      retrieveSubscription.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(subscriptionOn(299, 'usd', 'month'))

      await expect(getSubscriptionRenewal('sub_1')).resolves.toBeNull()
      now += RENEWAL_FAILURE_CACHE_TTL_MS - 1
      await expect(getSubscriptionRenewal('sub_1')).resolves.toBeNull()
      expect(retrieveSubscription).toHaveBeenCalledTimes(1)

      now += 1
      await expect(getSubscriptionRenewal('sub_1')).resolves.toEqual({ plan: 'monthly', price: '$2.99' })
      expect(retrieveSubscription).toHaveBeenCalledTimes(2)
    })
  })

  describe('GET /api/user/purchases', () => {
    it('never asks Stripe: it is on the profile first render', async () => {
      mockFindUnique.mockResolvedValue(renewingUser)

      const body = await (await GET_PURCHASES(new NextRequest('http://localhost:3000/api/user/purchases'))).json()

      expect(body).toEqual({
        isPremium: true,
        premiumUntil: IN_A_MONTH.toISOString(),
        cancelAtPeriodEnd: false,
        hasSubscriptionId: true,
      })
      expect(mockGetStripe).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/user/purchases/renewal', () => {
    const request = () => new NextRequest('http://localhost:3000/api/user/purchases/renewal')

    it('answers the renewal of a subscription that will renew', async () => {
      mockFindUnique.mockResolvedValue(renewingUser)
      retrieveSubscription.mockResolvedValue(subscriptionOn(299, 'usd', 'month'))

      const response = await GET_RENEWAL(request())

      expect(await response.json()).toEqual({ renewal: { plan: 'monthly', price: '$2.99' } })
      expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('does not ask Stripe for a subscription that is cancelling, lapsed, or absent', async () => {
      for (const row of [
        { ...renewingUser, premiumCancelAtPeriod: true },
        { ...renewingUser, premiumUntil: new Date(Date.now() - 86_400_000) },
        { premiumUntil: null, stripeSubscriptionId: null, premiumCancelAtPeriod: false },
        null,
      ]) {
        mockFindUnique.mockResolvedValueOnce(row)
        expect(await (await GET_RENEWAL(request())).json()).toEqual({ renewal: null })
      }
      expect(retrieveSubscription).not.toHaveBeenCalled()
    })

    it('answers 401 without a signed-in user', async () => {
      mockGetRequestAuthUser.mockResolvedValue(null)

      expect((await GET_RENEWAL(request())).status).toBe(401)
      expect(mockFindUnique).not.toHaveBeenCalled()
    })
  })

  describe('parsePremiumRenewal', () => {
    it('accepts only a known plan with a price', () => {
      expect(parsePremiumRenewal({ plan: 'yearly', price: '$24.99' })).toEqual({ plan: 'yearly', price: '$24.99' })
      expect(parsePremiumRenewal({ plan: 'lifetime', price: '$99' })).toBeNull()
      expect(parsePremiumRenewal({ plan: 'monthly', price: '' })).toBeNull()
      expect(parsePremiumRenewal(null)).toBeNull()
      expect(parsePremiumRenewal(undefined)).toBeNull()
    })
  })
})
