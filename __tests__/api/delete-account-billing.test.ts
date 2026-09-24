/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/user/delete-account/route'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

jest.mock('@/lib/db', () => ({
  prisma: {
    passwordResetTokens: { findUnique: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    emailVerificationTokens: { deleteMany: jest.fn() },
    friendRequests: { deleteMany: jest.fn() },
    friendships: { deleteMany: jest.fn() },
    users: { findUnique: jest.fn(), delete: jest.fn() },
  },
}))

jest.mock('@/lib/stripe', () => ({ getStripe: jest.fn() }))
jest.mock('@/lib/supabase-storage', () => ({
  deleteAvatar: jest.fn(),
  isAvatarStorageConfigured: jest.fn(() => false),
}))
jest.mock('@/lib/account-erasure', () => ({
  scrubPlayersFromGameRecords: jest.fn(async () => ({ games: 0, snapshots: 0 })),
  detachFeedbackFrom: jest.fn(async () => 0),
}))
jest.mock('@/lib/discord/role-connection', () => ({
  clearRoleConnection: jest.fn(async () => ({ status: 'skipped' })),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn(() => null) }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => true }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => () => Promise.resolve(null),
  rateLimitPresets: { auth: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

function request() {
  return new NextRequest('https://boardly.online/api/user/delete-account', {
    method: 'POST',
    body: JSON.stringify({ token: 'tok' }),
  })
}

describe('account deletion cancels billing first (#827)', () => {
  let cancel: jest.Mock

  beforeEach(() => {
    cancel = jest.fn().mockResolvedValue({})
    getStripe.mockReturnValue({ subscriptions: { cancel }, customers: { del: jest.fn().mockResolvedValue({}) } })
    prisma.passwordResetTokens.findUnique.mockResolvedValue({
      userId: 'u1',
      expires: new Date(Date.now() + 60_000),
    })
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      username: 'a',
      bot: null,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
    prisma.users.delete.mockResolvedValue({})
  })

  afterEach(() => jest.clearAllMocks())

  it('cancels the subscription before destroying the row that maps to it', async () => {
    await POST(request())

    expect(cancel).toHaveBeenCalledWith('sub_1')
    expect(prisma.users.delete).toHaveBeenCalled()
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.users.delete.mock.invocationCallOrder[0]
    )
  })

  it('refuses to delete when the subscription cannot be cancelled', async () => {
    // Deleting anyway would leave someone billed with no account to cancel from
    // and no record on our side to find them by.
    cancel.mockRejectedValue(new Error('stripe down'))

    const res = await POST(request())

    expect(res.status).toBe(502)
    expect(prisma.users.delete).not.toHaveBeenCalled()
  })

  it('still deletes when Stripe says the subscription is already gone', async () => {
    cancel.mockRejectedValue({ code: 'resource_missing' })

    await POST(request())

    expect(prisma.users.delete).toHaveBeenCalled()
  })

  it('deletes a free account without calling Stripe at all', async () => {
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@example.com', username: 'a', bot: null,
      stripeCustomerId: null, stripeSubscriptionId: null,
    })

    await POST(request())

    expect(cancel).not.toHaveBeenCalled()
    expect(prisma.users.delete).toHaveBeenCalled()
  })
})
