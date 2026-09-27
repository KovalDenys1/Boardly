/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.
/**
 * #1141: the account deletion token is stored as a hash with purpose 'delete', and
 * the delete route accepts nothing else: a password reset token posted to it finds
 * no row, whatever it looks like.
 */
import { NextRequest } from 'next/server'
import { POST as requestDeletion } from '@/app/api/user/request-deletion/route'
import { POST as deleteAccount } from '@/app/api/user/delete-account/route'
import { prisma } from '@/lib/db'
import { sendAccountDeletionEmail } from '@/lib/email'
import { hashAuthToken } from '@/lib/auth-tokens'

jest.mock('@/lib/db', () => ({
  prisma: {
    passwordResetTokens: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    emailVerificationTokens: { deleteMany: jest.fn() },
    friendRequests: { deleteMany: jest.fn() },
    friendships: { deleteMany: jest.fn() },
    users: { findUnique: jest.fn(), delete: jest.fn() },
  },
}))

jest.mock('@/lib/session-user', () => ({
  getSessionUserOrThrow: jest.fn(async () => ({ session: { user: { id: 'u1', email: 'ann@example.com' } } })),
  optionalSessionUser: jest.fn(async () => ({ session: null })),
}))
jest.mock('@/lib/email', () => ({ sendAccountDeletionEmail: jest.fn(async () => ({ success: true })) }))
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
jest.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => true }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => () => Promise.resolve(null),
  rateLimitPresets: { auth: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const post = (url: string, body: unknown) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify(body) })

describe('account deletion tokens (#1141)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'ann@example.com',
      username: 'ann',
      bot: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    })
    prisma.users.delete.mockResolvedValue({})
  })

  it('request-deletion stores the hash with purpose delete and mails the raw token', async () => {
    const res = await requestDeletion(post('https://boardly.online/api/user/request-deletion', {}))
    expect(res.status).toBe(200)

    const emailed = sendAccountDeletionEmail.mock.calls[0][1]
    expect(emailed).toMatch(/^[0-9a-f]{64}$/)
    expect(prisma.passwordResetTokens.create).toHaveBeenCalledWith({
      data: { userId: 'u1', tokenHash: hashAuthToken(emailed), purpose: 'delete', expires: expect.any(Date) },
    })
    expect(JSON.stringify(prisma.passwordResetTokens.create.mock.calls)).not.toContain(emailed)
  })

  it('delete-account answers 400 to a password reset token and deletes nothing', async () => {
    prisma.passwordResetTokens.findUnique.mockImplementation(async ({ where }) =>
      where.tokenHash === hashAuthToken('reset-token')
        ? { id: 't1', userId: 'u1', token: null, tokenHash: where.tokenHash, purpose: 'reset', expires: new Date(Date.now() + 60_000) }
        : null
    )

    const res = await deleteAccount(post('https://boardly.online/api/user/delete-account', { token: 'reset-token' }))

    expect(res.status).toBe(400)
    expect(prisma.users.delete).not.toHaveBeenCalled()
  })

  it('delete-account accepts its own token, looked up by hash', async () => {
    prisma.passwordResetTokens.findUnique.mockImplementation(async ({ where }) =>
      where.tokenHash === hashAuthToken('deletion-token')
        ? { id: 't2', userId: 'u1', token: null, tokenHash: where.tokenHash, purpose: 'delete', expires: new Date(Date.now() + 60_000) }
        : null
    )

    const res = await deleteAccount(post('https://boardly.online/api/user/delete-account', { token: 'deletion-token' }))

    expect(res.status).toBe(200)
    expect(prisma.users.delete).toHaveBeenCalledWith({ where: { id: 'u1' } })
  })

  it('delete-account still accepts a deletion link mailed before the change', async () => {
    prisma.passwordResetTokens.findUnique.mockImplementation(async ({ where }) =>
      where.token === 'DELETE_old-link'
        ? { id: 't3', userId: 'u1', token: 'DELETE_old-link', tokenHash: null, purpose: 'reset', expires: new Date(Date.now() + 60_000) }
        : null
    )

    const res = await deleteAccount(post('https://boardly.online/api/user/delete-account', { token: 'old-link' }))

    expect(res.status).toBe(200)
  })
})
