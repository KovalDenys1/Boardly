/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/user/delete-account/route'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { deleteAvatar, isAvatarStorageConfigured } from '@/lib/supabase-storage'
import { detachFeedbackFrom, scrubPlayersFromGameRecords } from '@/lib/account-erasure'

const mockLogCalls: unknown[][] = []

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
  isAvatarStorageConfigured: jest.fn(() => true),
}))
jest.mock('@/lib/account-erasure', () => ({
  scrubPlayersFromGameRecords: jest.fn(async () => ({ games: 3, snapshots: 12 })),
  detachFeedbackFrom: jest.fn(async () => 1),
}))
jest.mock('@/lib/discord/role-connection', () => ({
  clearRoleConnection: jest.fn(async () => ({ status: 'cleared' })),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn(() => null) }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => true }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => () => Promise.resolve(null),
  rateLimitPresets: { auth: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({
    info: (...args: unknown[]) => mockLogCalls.push(args),
    warn: (...args: unknown[]) => mockLogCalls.push(args),
    error: (...args: unknown[]) => mockLogCalls.push(args),
  }),
}))

function request() {
  return new NextRequest('https://boardly.online/api/user/delete-account', {
    method: 'POST',
    body: JSON.stringify({ token: 'tok' }),
  })
}

describe('account deletion erases what the cascade leaves behind (#1128)', () => {
  let cancel: jest.Mock
  let delCustomer: jest.Mock

  beforeEach(() => {
    mockLogCalls.length = 0
    cancel = jest.fn().mockResolvedValue({})
    delCustomer = jest.fn().mockResolvedValue({ deleted: true })
    getStripe.mockReturnValue({ subscriptions: { cancel }, customers: { del: delCustomer } })
    isAvatarStorageConfigured.mockReturnValue(true)
    deleteAvatar.mockResolvedValue(undefined)
    prisma.passwordResetTokens.findUnique.mockResolvedValue({
      userId: 'u1',
      expires: new Date(Date.now() + 60_000),
    })
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'ann@example.com',
      username: 'AnnTheGreat',
      bot: null,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    })
    prisma.users.delete.mockResolvedValue({})
  })

  afterEach(() => jest.clearAllMocks())

  it('removes the avatar, scrubs games and feedback, then deletes the Stripe customer, all before the row', async () => {
    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(deleteAvatar).toHaveBeenCalledWith('u1')
    expect(scrubPlayersFromGameRecords).toHaveBeenCalledWith([{ id: 'u1', username: 'AnnTheGreat' }])
    expect(detachFeedbackFrom).toHaveBeenCalledWith(['u1'], 'ann@example.com')
    expect(delCustomer).toHaveBeenCalledWith('cus_1')

    const deleteOrder = prisma.users.delete.mock.invocationCallOrder[0]
    for (const step of [deleteAvatar, scrubPlayersFromGameRecords, detachFeedbackFrom, delCustomer]) {
      expect(step.mock.invocationCallOrder[0]).toBeLessThan(deleteOrder)
    }
    // The customer goes after the subscription is cancelled, never instead of it.
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(delCustomer.mock.invocationCallOrder[0])
  })

  it('refuses, with the confirmation link still valid, when the avatar cannot be removed', async () => {
    deleteAvatar.mockRejectedValue(new Error('storage down'))

    const res = await POST(request())

    expect(res.status).toBe(502)
    expect(prisma.users.delete).not.toHaveBeenCalled()
    // Nothing is consumed, so the same link works on retry.
    expect(prisma.passwordResetTokens.deleteMany).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('skips storage where it was never configured, since nothing can have been uploaded', async () => {
    isAvatarStorageConfigured.mockReturnValue(false)

    await POST(request())

    expect(deleteAvatar).not.toHaveBeenCalled()
    expect(prisma.users.delete).toHaveBeenCalled()
  })

  it('still deletes the account when the Stripe customer cannot be deleted, and says so in the log', async () => {
    delCustomer.mockRejectedValue(new Error('stripe down'))

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.users.delete).toHaveBeenCalled()
    expect(JSON.stringify(mockLogCalls)).toContain('cus_1')
  })

  it('logs the user id and never the email or username', async () => {
    await POST(request())

    const logged = JSON.stringify(mockLogCalls)
    expect(logged).toContain('u1')
    expect(logged).not.toContain('ann@example.com')
    expect(logged).not.toContain('AnnTheGreat')
  })
})
