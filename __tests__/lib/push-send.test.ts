/**
 * What actually stops a push from being delivered (#984 review).
 *
 * `sendPushNotification` gated on `unsubscribedAll` as well as `pushNotifications` until the
 * review of #984. `unsubscribedAll` is the EMAIL switch - `/profile` calls it "Email
 * Notifications" and `/api/notifications/unsubscribe?type=all` promises only to stop emails -
 * so a player who had turned email off could accept either push opt-in, be told notifications
 * were on, and never receive one. There is no jest coverage of this file at all before now,
 * which is why the branch's own suite was green with the bug in it.
 */
import { sendPushNotification } from '@/lib/push-send'
import { prisma } from '@/lib/db'
import { getNotificationPreferences } from '@/lib/notification-preferences'
import webpush from 'web-push'

jest.mock('@/lib/db', () => ({
  prisma: {
    pushSubscriptions: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/notification-preferences', () => ({
  getNotificationPreferences: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}))

const mockFindMany = prisma.pushSubscriptions.findMany as jest.Mock
const mockGetPrefs = getNotificationPreferences as jest.MockedFunction<typeof getNotificationPreferences>
const mockSendNotification = webpush.sendNotification as jest.Mock

const PAYLOAD = {
  title: "It's your turn",
  body: 'Tap to make your move',
  url: '/lobby/AB12',
  tag: 'turn_reminder:game-1',
}

function prefs(overrides: Partial<Record<string, boolean>> = {}) {
  return {
    inAppNotifications: true,
    gameInvites: true,
    turnReminders: true,
    friendRequests: true,
    friendAccepted: true,
    pushNotifications: true,
    unsubscribedAll: false,
    ...overrides,
  }
}

describe('sendPushNotification preference gate (#984)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public'
    process.env.VAPID_PRIVATE_KEY = 'test-private'
    process.env.VAPID_SUBJECT = 'mailto:test@boardly.online'
    mockFindMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a' },
    ])
    mockSendNotification.mockResolvedValue(undefined)
  })

  it('delivers to a player who turned email notifications off - unsubscribedAll is the email switch', async () => {
    mockGetPrefs.mockResolvedValue(prefs({ unsubscribedAll: true }))

    await sendPushNotification('user-1', PAYLOAD)

    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })

  it('delivers to a player who turned turn-reminder emails off', async () => {
    mockGetPrefs.mockResolvedValue(prefs({ turnReminders: false }))

    await sendPushNotification('user-1', PAYLOAD)

    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })

  it('sends nothing, and does not even look for subscriptions, when push itself is off', async () => {
    mockGetPrefs.mockResolvedValue(prefs({ pushNotifications: false }))

    await sendPushNotification('user-1', PAYLOAD)

    expect(mockFindMany).not.toHaveBeenCalled()
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('sends nothing when push is off even with every other flag on', async () => {
    mockGetPrefs.mockResolvedValue(prefs({ pushNotifications: false, unsubscribedAll: false }))

    await sendPushNotification('user-1', PAYLOAD)

    expect(mockSendNotification).not.toHaveBeenCalled()
  })
})
