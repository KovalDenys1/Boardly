// @ts-nocheck - prisma is a lightweight mock.
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { deleteUserAccount } from '@/lib/account-deletion'
import { scrubPlayersFromGameRecords } from '@/lib/account-erasure'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    passwordResetTokens: { deleteMany: jest.fn() },
    emailVerificationTokens: { deleteMany: jest.fn() },
    friendRequests: { deleteMany: jest.fn() },
    friendships: { deleteMany: jest.fn() },
  },
}))
jest.mock('@/lib/stripe', () => ({ getStripe: jest.fn() }))
jest.mock('@/lib/supabase-storage', () => ({
  deleteAvatar: jest.fn(),
  isAvatarStorageConfigured: jest.fn(() => true),
}))
jest.mock('@/lib/account-erasure', () => ({
  scrubPlayersFromGameRecords: jest.fn(async () => ({ games: 1, snapshots: 0 })),
  detachFeedbackFrom: jest.fn(async () => 0),
}))
jest.mock('@/lib/discord/role-connection', () => ({
  clearRoleConnection: jest.fn(async () => ({ status: 'skipped' })),
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const USER = {
  id: 'u1',
  email: 'ann@example.com',
  username: 'Ann',
  bot: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
}

describe('deleteUserAccount under a guard (#1130, the inactivity rule)', () => {
  const guard = { AND: [{ role: 'user' }, { lastActiveAt: new Date('2026-01-01T00:00:00Z') }] }

  beforeEach(() => {
    jest.clearAllMocks()
    getStripe.mockReturnValue({ subscriptions: { cancel: jest.fn() }, customers: { del: jest.fn() } })
    prisma.users.findFirst.mockResolvedValue(USER)
    prisma.users.deleteMany.mockResolvedValue({ count: 1 })
  })

  it('reads and deletes the row only while it still matches the rule', async () => {
    const result = await deleteUserAccount('u1', { reason: 'inactivity', guard })

    expect(result).toEqual({ status: 'deleted', cancelledSubscription: false })
    expect(prisma.users.findFirst.mock.calls[0][0].where).toEqual({ AND: [{ id: 'u1' }, guard] })
    expect(prisma.users.deleteMany).toHaveBeenCalledWith({ where: { AND: [{ id: 'u1' }, guard] } })
    expect(prisma.users.delete).not.toHaveBeenCalled()
    // The same erasure as a deletion the owner asked for.
    expect(scrubPlayersFromGameRecords).toHaveBeenCalledWith([{ id: 'u1', username: 'Ann' }])
  })

  it('does nothing to an account that no longer matches', async () => {
    prisma.users.findFirst.mockResolvedValue(null)

    const result = await deleteUserAccount('u1', { reason: 'inactivity', guard })

    expect(result).toEqual({ status: 'not_found' })
    expect(scrubPlayersFromGameRecords).not.toHaveBeenCalled()
    expect(prisma.users.deleteMany).not.toHaveBeenCalled()
  })

  it('keeps the row when the rule stops matching at the last step', async () => {
    prisma.users.deleteMany.mockResolvedValue({ count: 0 })

    const result = await deleteUserAccount('u1', { reason: 'inactivity', guard })

    expect(result).toEqual({ status: 'not_found' })
  })

  it('never deletes a bot', async () => {
    prisma.users.findFirst.mockResolvedValue({ ...USER, bot: { id: 'b1' } })

    expect(await deleteUserAccount('u1', { reason: 'inactivity', guard })).toEqual({ status: 'bot' })
    expect(prisma.users.deleteMany).not.toHaveBeenCalled()
  })
})
