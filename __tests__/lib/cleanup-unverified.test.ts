// @ts-nocheck

import { cleanupUnverifiedAccounts, warnUnverifiedAccounts } from '@/lib/cleanup-unverified'
import { prisma } from '@/lib/db'
import { sendUnverifiedAccountWarningEmail } from '@/lib/email'
import { nanoid } from 'nanoid'

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
          token: 'warning-token-123',
        }),
      })
    )
    expect(mockSendWarningEmail).toHaveBeenCalledWith(
      'pending@example.com',
      'warning-token-123',
      'pending-user',
      expect.any(Number)
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
      where: { id: { in: ['user-1'] } },
    })
  })
})
