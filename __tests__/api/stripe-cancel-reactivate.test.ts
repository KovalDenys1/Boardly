/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST as cancel } from '@/app/api/stripe/cancel/route'
import { POST as reactivate } from '@/app/api/stripe/reactivate/route'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockGetStripe = getStripe as jest.MockedFunction<typeof getStripe>

// The caller is user-1; user-2's subscription is the one a caller might try to name.
const OWN_SUBSCRIPTION = 'sub_own'
const OTHER_SUBSCRIPTION = 'sub_belongs_to_user_2'

function signedInAs(userId: string, stripeSubscriptionId: string | null) {
  mockGetServerSession.mockResolvedValue({ user: { id: userId } } as any)
  // requireSessionUser re-reads `suspended` on a write; the route then reads the subscription.
  prisma.users.findUnique.mockImplementation(async ({ where, select }) => {
    if (where.id !== userId) return null
    return select.suspended ? { suspended: false } : { stripeSubscriptionId }
  })
}

function post(path: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
}

describe.each([
  { name: 'cancel', route: cancel, path: '/api/stripe/cancel', cancelAtPeriodEnd: true, missing: 'No active subscription found' },
  { name: 'reactivate', route: reactivate, path: '/api/stripe/reactivate', cancelAtPeriodEnd: false, missing: 'No subscription found' },
])('POST /api/stripe/$name', ({ route, path, cancelAtPeriodEnd, missing }) => {
  let update: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    update = jest.fn().mockResolvedValue({ id: OWN_SUBSCRIPTION, cancel_at_period_end: cancelAtPeriodEnd })
    mockGetStripe.mockReturnValue({ subscriptions: { update } } as any)
    prisma.users.update.mockResolvedValue({})
  })

  it(`sets cancel_at_period_end to ${cancelAtPeriodEnd} on the caller's subscription in Stripe, then on the account`, async () => {
    signedInAs('user-1', OWN_SUBSCRIPTION)

    const response = await route(post(path))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(OWN_SUBSCRIPTION, { cancel_at_period_end: cancelAtPeriodEnd })
    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { premiumCancelAtPeriod: cancelAtPeriodEnd },
    })
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(prisma.users.update.mock.invocationCallOrder[0])
  })

  it('answers 400 and touches neither Stripe nor the account when the caller has no subscription', async () => {
    signedInAs('user-1', null)

    const response = await route(post(path))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: missing })
    expect(update).not.toHaveBeenCalled()
    expect(prisma.users.update).not.toHaveBeenCalled()
  })

  it("never acts on someone else's subscription named in the request", async () => {
    signedInAs('user-1', OWN_SUBSCRIPTION)

    const response = await route(post(`${path}?subscriptionId=${OTHER_SUBSCRIPTION}`, {
      subscriptionId: OTHER_SUBSCRIPTION,
      userId: 'user-2',
    }))

    expect(response.status).toBe(200)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(OWN_SUBSCRIPTION, { cancel_at_period_end: cancelAtPeriodEnd })
    expect(prisma.users.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }))
  })

  it("refuses someone else's subscription when the caller has none of their own", async () => {
    signedInAs('user-1', null)

    const response = await route(post(path, { subscriptionId: OTHER_SUBSCRIPTION, userId: 'user-2' }))

    expect(response.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
    expect(prisma.users.update).not.toHaveBeenCalled()
  })

  it('answers 401 to a signed-out caller and never reaches Stripe', async () => {
    mockGetServerSession.mockResolvedValue(null as any)

    const response = await route(post(path, { subscriptionId: OTHER_SUBSCRIPTION }))

    expect(response.status).toBe(401)
    expect(update).not.toHaveBeenCalled()
    expect(prisma.users.update).not.toHaveBeenCalled()
  })
})
