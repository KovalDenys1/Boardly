// @ts-nocheck

import { cleanupUnverifiedAccounts, warnUnverifiedAccounts } from '@/lib/cleanup-unverified'
import { prisma } from '@/lib/db'
import { sendUnverifiedAccountWarningEmail } from '@/lib/email'
import { nanoid } from 'nanoid'
import { hashAuthToken } from '@/lib/auth-tokens'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    emailVerificationTokens: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    passwordResetTokens: {
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/email', () => ({
  sendUnverifiedAccountWarningEmail: jest.fn(),
}))

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'warning-token-123'),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendWarningEmail =
  sendUnverifiedAccountWarningEmail as jest.MockedFunction<typeof sendUnverifiedAccountWarningEmail>
const mockNanoid = nanoid as jest.MockedFunction<typeof nanoid>

describe('cleanup-unverified', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.users.findMany.mockResolvedValue([])
    mockPrisma.users.deleteMany.mockResolvedValue({ count: 0 } as any)
    mockPrisma.emailVerificationTokens.deleteMany.mockResolvedValue({ count: 0 } as any)
    mockPrisma.emailVerificationTokens.create.mockResolvedValue({ id: 'evt-1' } as any)
    mockPrisma.passwordResetTokens.deleteMany.mockResolvedValue({ count: 0 } as any)
    mockSendWarningEmail.mockResolvedValue({ success: true })
  })

  it('returns zero warning stats when no users are in the warning window', async () => {
    const result = await warnUnverifiedAccounts(2, 7)

    expect(result.warned).toBe(0)
    expect(result.users).toEqual([])
    expect(mockSendWarningEmail).not.toHaveBeenCalled()
    expect(mockPrisma.emailVerificationTokens.create).not.toHaveBeenCalled()
  })

  it('creates fresh verification token and sends warning email', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'pending@example.com',
        username: 'pending-user',
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
      },
    ] as any)

    const result = await warnUnverifiedAccounts(2, 7)

    expect(result.warned).toBe(1)
    expect(result.emailsSent).toBe(1)
    expect(result.emailFailures).toBe(0)
    expect(result.users).toHaveLength(1)
    expect(result.users[0].emailSent).toBe(true)

    expect(mockPrisma.emailVerificationTokens.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
    expect(mockNanoid).toHaveBeenCalledWith(32)
    expect(mockPrisma.emailVerificationTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          tokenHash: hashAuthToken('warning-token-123'),
        }),
      })
    )
    expect(mockSendWarningEmail).toHaveBeenCalledWith(
      'pending@example.com',
      'warning-token-123',
      'pending-user',
      expect.any(Number),
      'en'
    )
  })

  it('records warning email failure without throwing', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'pending@example.com',
        username: 'pending-user',
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
      },
    ] as any)
    mockSendWarningEmail.mockResolvedValue({ success: false, error: 'smtp unavailable' })

    const result = await warnUnverifiedAccounts(2, 7)

    expect(result.warned).toBe(1)
    expect(result.emailsSent).toBe(0)
    expect(result.emailFailures).toBe(1)
    expect(result.users[0].emailSent).toBe(false)
    expect(result.users[0].emailError).toBe('smtp unavailable')
  })

  it('skips warning email when user has no email', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: null,
        username: 'pending-user',
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
      },
    ] as any)

    const result = await warnUnverifiedAccounts(2, 7)

    expect(result.warned).toBe(1)
    expect(result.emailsSent).toBe(0)
    expect(result.emailFailures).toBe(1)
    expect(result.users[0].emailSent).toBe(false)
    expect(result.users[0].emailError).toBe('missing_email')
    expect(mockPrisma.emailVerificationTokens.create).not.toHaveBeenCalled()
    expect(mockSendWarningEmail).not.toHaveBeenCalled()
  })

  it('cleanupUnverifiedAccounts removes users and linked tokens', async () => {
    mockPrisma.users.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'pending@example.com',
        username: 'pending-user',
        createdAt: new Date('2026-01-20T10:00:00.000Z'),
      },
    ] as any)
    mockPrisma.users.deleteMany.mockResolvedValue({ count: 1 } as any)

    const result = await cleanupUnverifiedAccounts(7)

    expect(result.deleted).toBe(1)
    expect(mockPrisma.emailVerificationTokens.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user-1'] } },
    })
    expect(mockPrisma.passwordResetTokens.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user-1'] } },
    })
    expect(mockPrisma.users.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { in: ['user-1'] } }),
    })
  })

  describe('never touches a customer (#1139)', () => {
    /**
     * The mocked findMany cannot run a where clause, so this evaluates the one the job
     * sends against rows, for the fields the purge rule reads.
     */
    function matches(where: Record<string, any>, row: Record<string, any>): boolean {
      return Object.entries(where).every(([field, condition]) => {
        if (field === 'OR') return condition.some((branch: Record<string, any>) => matches(branch, row))
        if (field === 'createdAt' || field === 'bot' || field === 'id') return true
        if (condition === null) return row[field] === null
        // A to-many relation filter: `{ none: {} }` holds when the row has no related rows.
        if (condition && typeof condition === 'object' && 'none' in condition) {
          return (row[field] ?? []).length === 0
        }
        if (condition && typeof condition === 'object' && 'lte' in condition) {
          return row[field] !== null && row[field] <= condition.lte
        }
        return row[field] === condition
      })
    }

    const DAY = 24 * 60 * 60 * 1000
    const unverified = {
      isGuest: false,
      emailVerified: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      premiumUntil: null,
      purchaseConsents: [],
      accounts: [],
    }
    const rows = {
      plain: unverified,
      subscribed: { ...unverified, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_123' },
      paidTimeLeft: { ...unverified, stripeCustomerId: 'cus_1', premiumUntil: new Date(Date.now() + 5 * DAY) },
      // Premium given without a purchase (an admin grant) that has run out: no customer.
      grantLapsed: { ...unverified, premiumUntil: new Date(Date.now() - 5 * DAY) },
      // Ever paid, now cancelled and lapsed: the Stripe customer id stays behind.
      paidOnceLapsed: { ...unverified, stripeCustomerId: 'cus_1', premiumUntil: new Date(Date.now() - 5 * DAY) },
      // A recorded checkout consent, whatever the Stripe columns say.
      consented: { ...unverified, purchaseConsents: [{ id: 'pc_1' }] },
      oauth: { ...unverified, accounts: [{ provider: 'google' }] },
      // A guest carries a placeholder guest-<id>@boardly.guest address that bounces (#1256).
      guest: { ...unverified, isGuest: true },
    }

    it('the deletion excludes a subscription and Premium time still to run', async () => {
      await cleanupUnverifiedAccounts(7)
      const { where } = mockPrisma.users.findMany.mock.calls[0][0]

      expect(matches(where, rows.plain)).toBe(true)
      expect(matches(where, rows.grantLapsed)).toBe(true)
      expect(matches(where, rows.subscribed)).toBe(false)
      expect(matches(where, rows.paidTimeLeft)).toBe(false)
    })

    it('the deletion spares an account that ever paid, so its purchase records survive', async () => {
      await cleanupUnverifiedAccounts(7)
      const { where } = mockPrisma.users.findMany.mock.calls[0][0]

      expect(matches(where, rows.paidOnceLapsed)).toBe(false)
      expect(matches(where, rows.consented)).toBe(false)
    })

    it('the warning uses the same rule, so a customer is never told the account will go', async () => {
      await warnUnverifiedAccounts(2, 7)
      const { where } = mockPrisma.users.findMany.mock.calls[0][0]

      expect(matches(where, rows.plain)).toBe(true)
      expect(matches(where, rows.subscribed)).toBe(false)
      expect(matches(where, rows.paidTimeLeft)).toBe(false)
      expect(matches(where, rows.paidOnceLapsed)).toBe(false)
      expect(matches(where, rows.consented)).toBe(false)
    })

    it('checks the rule again in the delete itself, in case the account paid meanwhile', async () => {
      mockPrisma.users.findMany.mockResolvedValue([
        { id: 'user-1', email: 'pending@example.com', username: 'pending-user', createdAt: new Date('2026-01-20T10:00:00.000Z') },
      ] as any)
      mockPrisma.users.deleteMany.mockResolvedValue({ count: 0 } as any)

      await cleanupUnverifiedAccounts(7)
      const { where } = mockPrisma.users.deleteMany.mock.calls[0][0]

      expect(where.id).toEqual({ in: ['user-1'] })
      expect(matches(where, rows.plain)).toBe(true)
      expect(matches(where, rows.subscribed)).toBe(false)
      expect(matches(where, rows.paidTimeLeft)).toBe(false)
      expect(matches(where, rows.paidOnceLapsed)).toBe(false)
      expect(matches(where, rows.consented)).toBe(false)
    })

    it('never warns or deletes a guest, whose address only bounces (#1256)', async () => {
      await warnUnverifiedAccounts(2, 7)
      expect(matches(mockPrisma.users.findMany.mock.calls[0][0].where, rows.guest)).toBe(false)
      mockPrisma.users.findMany.mockClear()
      await cleanupUnverifiedAccounts(7)
      expect(matches(mockPrisma.users.findMany.mock.calls[0][0].where, rows.guest)).toBe(false)
    })

    it('still spares bots and accounts that sign in with a provider', async () => {
      await cleanupUnverifiedAccounts(7)
      const { where } = mockPrisma.users.findMany.mock.calls[0][0]

      expect(where.bot).toBeNull()
      expect(matches(where, rows.oauth)).toBe(false)
    })
  })
})
