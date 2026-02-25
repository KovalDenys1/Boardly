// @ts-nocheck

import {
  sendFriendAcceptedNotificationEmail,
  sendFriendRequestNotificationEmail,
} from '@/lib/friend-notification-emails'
import { sendFriendAcceptedEmail, sendFriendRequestEmail } from '@/lib/email'
import {
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
} from '@/lib/notification-preferences'
import { recordNotificationDelivery } from '@/lib/notifications-log'

jest.mock('@/lib/email', () => ({
  sendFriendAcceptedEmail: jest.fn(),
  sendFriendRequestEmail: jest.fn(),
}))

jest.mock('@/lib/notification-preferences', () => ({
  createNotificationUnsubscribeToken: jest.fn(),
  getNotificationPreferences: jest.fn(),
}))

jest.mock('@/lib/notifications-log', () => ({
  recordNotificationDelivery: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockSendFriendRequestEmail = sendFriendRequestEmail as jest.MockedFunction<typeof sendFriendRequestEmail>
const mockSendFriendAcceptedEmail = sendFriendAcceptedEmail as jest.MockedFunction<typeof sendFriendAcceptedEmail>
const mockCreateNotificationUnsubscribeToken =
  createNotificationUnsubscribeToken as jest.MockedFunction<typeof createNotificationUnsubscribeToken>
const mockGetNotificationPreferences =
  getNotificationPreferences as jest.MockedFunction<typeof getNotificationPreferences>
const mockRecordNotificationDelivery =
  recordNotificationDelivery as jest.MockedFunction<typeof recordNotificationDelivery>

describe('friend notification email helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendFriendRequestEmail.mockResolvedValue({ success: true })
    mockSendFriendAcceptedEmail.mockResolvedValue({ success: true })
    mockCreateNotificationUnsubscribeToken.mockReturnValue('token-123')
    mockGetNotificationPreferences.mockResolvedValue({
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: false,
    })
    mockRecordNotificationDelivery.mockResolvedValue(undefined)
  })

  it('sends friend request email and logs delivery when enabled', async () => {
    const result = await sendFriendRequestNotificationEmail({
      sender: {
        id: 'sender-1',
        username: 'Alice',
        email: 'alice@example.com',
      },
      receiver: {
        id: 'receiver-1',
        username: 'Bob',
        email: 'bob@example.com',
      },
      requestId: 'req-1',
      source: 'username',
      baseUrl: 'http://localhost:3000',
    })

    expect(result).toEqual({ success: true, skipped: false, reason: undefined })
    expect(mockSendFriendRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bob@example.com',
        senderName: 'Alice',
        profileUrl: 'http://localhost:3000/profile',
      })
    )
    expect(mockRecordNotificationDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'receiver-1',
        type: 'friend_request',
        status: 'sent',
        dedupeKey: 'friend_request:request:req-1:recipient:receiver-1',
      })
    )
  })

  it('skips friend accepted email when recipient disabled friendAccepted notifications', async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: false,
      unsubscribedAll: false,
    })

    const result = await sendFriendAcceptedNotificationEmail({
      accepter: {
        id: 'accepter-1',
        username: 'Bob',
        email: 'bob@example.com',
      },
      requester: {
        id: 'requester-1',
        username: 'Alice',
        email: 'alice@example.com',
      },
      requestId: 'req-2',
      friendshipId: 'friendship-1',
      baseUrl: 'http://localhost:3000',
    })

    expect(result).toEqual({
      success: false,
      skipped: true,
      reason: 'friend_accepted_disabled',
    })
    expect(mockSendFriendAcceptedEmail).not.toHaveBeenCalled()
    expect(mockRecordNotificationDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'requester-1',
        type: 'friend_accepted',
        status: 'skipped',
        reason: 'friend_accepted_disabled',
      })
    )
  })

  it('skips friend request email when recipient email is missing', async () => {
    const result = await sendFriendRequestNotificationEmail({
      sender: {
        id: 'sender-1',
        username: 'Alice',
        email: 'alice@example.com',
      },
      receiver: {
        id: 'receiver-1',
        username: 'Bob',
        email: null,
      },
      requestId: 'req-3',
      source: 'friend_code',
      baseUrl: 'http://localhost:3000',
    })

    expect(result).toEqual({
      success: false,
      skipped: true,
      reason: 'missing_recipient_email',
    })
    expect(mockGetNotificationPreferences).not.toHaveBeenCalled()
    expect(mockSendFriendRequestEmail).not.toHaveBeenCalled()
    expect(mockRecordNotificationDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'receiver-1',
        type: 'friend_request',
        status: 'skipped',
        reason: 'missing_recipient_email',
      })
    )
  })
})
