/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/user/purchases/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getStripe } from '@/lib/stripe'
import { getSubscriptionRenewal } from '@/lib/server/premium-pricing'
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

describe('the renewal price on the profile (#1167)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetStripe.mockReturnValue({ subscriptions: { retrieve: retrieveSubscription } })
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' })
  })

  describe('getSubscriptionRenewal', () => {
    it('reads the plan and the list price off the subscription itself', async () => {
      retrieveSubscription.mockResolvedValue(subscriptionOn(299, 'usd', 'month'))

      await expect(getSubscriptionRenewal('sub_1')).resolves.toEqual({ plan: 'monthly', price: '$2.99' })
      expect(retrieveSubscription).toHaveBeenCalledWith('sub_1')
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
  })

  describe('GET /api/user/purchases', () => {
    const request = () => new NextRequest('http://localhost:3000/api/user/purchases')

    it('carries the renewal of a subscription that will renew', async () => {
      mockFindUnique.mockResolvedValue({
        premiumUntil: IN_A_MONTH,
        stripeSubscriptionId: 'sub_1',
        premiumCancelAtPeriod: false,
      })
      retrieveSubscription.mockResolvedValue(subscriptionOn(299, 'usd', 'month'))

      const body = await (await GET(request())).json()

      expect(body).toMatchObject({ isPremium: true, renewal: { plan: 'monthly', price: '$2.99' } })
    })

    it('does not ask Stripe for a subscription that is cancelling, or for a free account', async () => {
      mockFindUnique.mockResolvedValueOnce({
        premiumUntil: IN_A_MONTH,
        stripeSubscriptionId: 'sub_1',
        premiumCancelAtPeriod: true,
      })
      expect((await (await GET(request())).json()).renewal).toBeNull()

      mockFindUnique.mockResolvedValueOnce({ premiumUntil: null, stripeSubscriptionId: null, premiumCancelAtPeriod: false })
      expect((await (await GET(request())).json()).renewal).toBeNull()

      expect(retrieveSubscription).not.toHaveBeenCalled()
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
