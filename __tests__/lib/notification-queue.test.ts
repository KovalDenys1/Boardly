// @ts-nocheck

import {
  enqueueEmailNotification,
  processNotificationEmailQueue,
} from '@/lib/notification-queue'
import { prisma } from '@/lib/db'
import {
  sendFriendAcceptedEmail,
  sendFriendRequestDigestEmail,
  sendFriendRequestEmail,
} from '@/lib/email'
import {
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
} from '@/lib/notification-preferences'

jest.mock('@/lib/db', () => ({
  prisma: {
    notifications: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/email', () => ({
  sendFriendAcceptedEmail: jest.fn(),
  sendFriendRequestDigestEmail: jest.fn(),
  sendFriendRequestEmail: jest.fn(),
}))

jest.mock('@/lib/notification-preferences', () => ({
  createNotificationUnsubscribeToken: jest.fn(),
  getNotificationPreferences: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendFriendAcceptedEmail =
  sendFriendAcceptedEmail as jest.MockedFunction<typeof sendFriendAcceptedEmail>
const mockSendFriendRequestDigestEmail =
  sendFriendRequestDigestEmail as jest.MockedFunction<typeof sendFriendRequestDigestEmail>
const mockSendFriendRequestEmail =
  sendFriendRequestEmail as jest.MockedFunction<typeof sendFriendRequestEmail>
const mockCreateNotificationUnsubscribeToken =
  createNotificationUnsubscribeToken as jest.MockedFunction<typeof createNotificationUnsubscribeToken>
const mockGetNotificationPreferences =
  getNotificationPreferences as jest.MockedFunction<typeof getNotificationPreferences>

function basePrefs(overrides: Record<string, unknown> = {}) {
  return {
    gameInvites: true,
    turnReminders: true,
    friendRequests: true,
    friendAccepted: true,
    unsubscribedAll: false,
    ...overrides,
  }
}

describe('notification queue', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.notifications.findFirst.mockResolvedValue(null as any)
    mockPrisma.notifications.create.mockResolvedValue({ id: 'n1' } as any)
    mockPrisma.notifications.findMany.mockResolvedValue([] as any)
    mockPrisma.notifications.updateMany.mockResolvedValue({ count: 0 } as any)
    mockPrisma.notifications.update.mockResolvedValue({ id: 'n1' } as any)
    mockSendFriendAcceptedEmail.mockResolvedValue({ success: true })
    mockSendFriendRequestDigestEmail.mockResolvedValue({ success: true })
    mockSendFriendRequestEmail.mockResolvedValue({ success: true })
    mockCreateNotificationUnsubscribeToken.mockReturnValue('token-123')
    mockGetNotificationPreferences.mockResolvedValue(basePrefs() as any)
  })

  it('deduplicates enqueue when same dedupeKey is already queued', async () => {
    mockPrisma.notifications.findFirst.mockResolvedValue({ id: 'existing-1' } as any)

    const result = await enqueueEmailNotification({
      userId: 'user-1',
      type: 'friend_request',
      dedupeKey: 'friend_request:request:req-1:recipient:user-1',
      payload: { senderName: 'Alice' },
    })

    expect(result).toEqual({
      queued: false,
      skipped: true,
      reason: 'duplicate_queued',
    })
    expect(mockPrisma.notifications.create).not.toHaveBeenCalled()
  })

  it('batches multiple friend_request queue rows into one digest email', async () => {
    const queuedRows = [
      {
        id: 'n1',
        userId: 'user-1',
        type: 'friend_request',
        status: 'queued',
        dedupeKey: 'd1',
        payload: {
          requestId: 'req-1',
          senderId: 'sender-1',
          senderName: 'Alice',
          receiverId: 'user-1',
          receiverName: 'Bob',
          recipientEmail: 'bob@example.com',
        },
        createdAt: new Date('2026-02-25T10:00:00.000Z'),
      },
      {
        id: 'n2',
        userId: 'user-1',
        type: 'friend_request',
        status: 'queued',
        dedupeKey: 'd2',
        payload: {
          requestId: 'req-2',
          senderId: 'sender-2',
          senderName: 'Charlie',
          receiverId: 'user-1',
          receiverName: 'Bob',
          recipientEmail: 'bob@example.com',
        },
        createdAt: new Date('2026-02-25T10:01:00.000Z'),
      },
    ]

    mockPrisma.notifications.findMany
      .mockResolvedValueOnce(queuedRows as any)
      .mockResolvedValueOnce(
        queuedRows.map((row) => ({ ...row, status: 'processing' })) as any
      )

    const result = await processNotificationEmailQueue({
      baseUrl: 'http://localhost:3000',
      batchLimit: 10,
    })

    expect(result.success).toBe(true)
    expect(result.claimed).toBe(2)
    expect(result.processed).toBe(2)
    expect(result.sent).toBe(2)
    expect(result.batchedDigestsSent).toBe(1)
    expect(mockSendFriendRequestDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bob@example.com',
        requestCount: 2,
        senderNames: ['Alice', 'Charlie'],
        profileUrl: 'http://localhost:3000/profile',
      })
    )
    expect(mockSendFriendRequestEmail).not.toHaveBeenCalled()
    expect(mockPrisma.notifications.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'processing',
        }),
      })
    )
    expect(mockPrisma.notifications.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
        }),
      })
    )
  })

  it('skips friend_accepted queue row when recipient disabled preference', async () => {
    const queuedRow = {
      id: 'n3',
      userId: 'user-2',
      type: 'friend_accepted',
      status: 'queued',
      dedupeKey: 'd3',
      payload: {
        requestId: 'req-3',
        friendshipId: 'f1',
        accepterId: 'acc-1',
        accepterName: 'Bob',
        requesterId: 'user-2',
        requesterName: 'Alice',
        recipientEmail: 'alice@example.com',
      },
      createdAt: new Date('2026-02-25T10:02:00.000Z'),
    }

    mockPrisma.notifications.findMany
      .mockResolvedValueOnce([queuedRow] as any)
      .mockResolvedValueOnce([{ ...queuedRow, status: 'processing' }] as any)

    mockGetNotificationPreferences.mockResolvedValue(basePrefs({ friendAccepted: false }) as any)

    const result = await processNotificationEmailQueue({
      baseUrl: 'http://localhost:3000',
      batchLimit: 10,
    })

    expect(result.claimed).toBe(1)
    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
    expect(mockSendFriendAcceptedEmail).not.toHaveBeenCalled()
    expect(mockPrisma.notifications.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n3' },
        data: expect.objectContaining({
          status: 'skipped',
          reason: 'friend_accepted_disabled',
        }),
      })
    )
  })
})
