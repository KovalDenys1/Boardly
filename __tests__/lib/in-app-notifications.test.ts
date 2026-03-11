import {
  createInAppNotification,
  markInAppNotificationsRead,
} from '@/lib/in-app-notifications'
import { prisma } from '@/lib/db'
import { getNotificationPreferences } from '@/lib/notification-preferences'

jest.mock('@/lib/db', () => ({
  prisma: {
    notifications: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/notification-preferences', () => ({
  getNotificationPreferences: jest.fn(),
}))

const mockNotifications = prisma.notifications as unknown as {
  findFirst: jest.Mock
  create: jest.Mock
  updateMany: jest.Mock
}
const mockGetNotificationPreferences = getNotificationPreferences as jest.MockedFunction<typeof getNotificationPreferences>

describe('in-app notifications helper', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetNotificationPreferences.mockResolvedValue({
      inAppNotifications: true,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: false,
    })
    mockNotifications.findFirst.mockResolvedValue(null)
    mockNotifications.create.mockResolvedValue({ id: 'notification-1' })
    mockNotifications.updateMany.mockResolvedValue({ count: 2 })
  })

  it('deduplicates creation when a notification with the same dedupe key already exists', async () => {
    mockNotifications.findFirst.mockResolvedValue({ id: 'existing-1' })

    const result = await createInAppNotification({
      userId: 'user-1',
      type: 'friend_request',
      dedupeKey: 'friend_request:req-1',
      payload: { href: '/profile?tab=friends' },
    })

    expect(result).toEqual({ created: false, id: 'existing-1' })
    expect(mockNotifications.create).not.toHaveBeenCalled()
  })

  it('skips creating notifications when in-app delivery is disabled', async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      inAppNotifications: false,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: false,
    })

    const result = await createInAppNotification({
      userId: 'user-1',
      type: 'friend_request',
      dedupeKey: 'friend_request:req-2',
      payload: { href: '/profile?tab=friends' },
    })

    expect(result).toEqual({
      created: false,
      id: null,
      skipped: true,
      reason: 'in_app_disabled',
    })
    expect(mockNotifications.findFirst).not.toHaveBeenCalled()
    expect(mockNotifications.create).not.toHaveBeenCalled()
  })

  it('marks only in-app notifications for the current user as read', async () => {
    await markInAppNotificationsRead('user-1', ['n1', 'n2'])

    expect(mockNotifications.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          channel: 'in_app',
          id: { in: ['n1', 'n2'] },
          readAt: null,
        }),
        data: expect.objectContaining({
          readAt: expect.any(Date),
        }),
      })
    )
  })
})
