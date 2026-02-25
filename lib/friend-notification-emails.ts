import { logger } from './logger'
import { sendFriendAcceptedEmail, sendFriendRequestEmail } from './email'
import {
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
} from './notification-preferences'
import { recordNotificationDelivery } from './notifications-log'

type FriendUserRef = {
  id: string
  username?: string | null
  email?: string | null
}

type SendFriendRequestNotificationEmailInput = {
  sender: FriendUserRef
  receiver: FriendUserRef
  requestId?: string
  source?: 'username' | 'friend_code'
  baseUrl?: string
}

type SendFriendAcceptedNotificationEmailInput = {
  accepter: FriendUserRef
  requester: FriendUserRef
  requestId?: string
  friendshipId?: string
  baseUrl?: string
}

type FriendNotificationResult = {
  success: boolean
  skipped: boolean
  reason?: string
}

function normalizeBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').trim()
  return raw.replace(/\/+$/, '')
}

export async function sendFriendRequestNotificationEmail(
  input: SendFriendRequestNotificationEmailInput
): Promise<FriendNotificationResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const recipient = input.receiver
  const senderName = input.sender.username || 'Player'
  const dedupeKey = input.requestId
    ? `friend_request:request:${input.requestId}:recipient:${recipient.id}`
    : `friend_request:recipient:${recipient.id}:sender:${input.sender.id}`

  const payload = {
    requestId: input.requestId,
    source: input.source || 'username',
    senderId: input.sender.id,
    senderName,
    receiverId: recipient.id,
    receiverName: recipient.username || null,
  }

  if (!recipient.email) {
    await recordNotificationDelivery({
      userId: recipient.id,
      type: 'friend_request',
      status: 'skipped',
      reason: 'missing_recipient_email',
      dedupeKey,
      payload,
    })
    return { success: false, skipped: true, reason: 'missing_recipient_email' }
  }

  try {
    const prefs = await getNotificationPreferences(recipient.id)
    if (prefs.unsubscribedAll || !prefs.friendRequests) {
      const reason = prefs.unsubscribedAll ? 'unsubscribed_all' : 'friend_requests_disabled'
      await recordNotificationDelivery({
        userId: recipient.id,
        type: 'friend_request',
        status: 'skipped',
        reason,
        dedupeKey,
        payload,
      })
      return { success: false, skipped: true, reason }
    }

    const token = createNotificationUnsubscribeToken({
      userId: recipient.id,
      type: 'friendRequests',
    })
    const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
    const profileUrl = `${baseUrl}/profile`

    const emailResult = await sendFriendRequestEmail({
      email: recipient.email,
      recipientName: recipient.username,
      senderName,
      profileUrl,
      unsubscribeUrl,
    })

    await recordNotificationDelivery({
      userId: recipient.id,
      type: 'friend_request',
      status: emailResult.success ? 'sent' : 'failed',
      reason: emailResult.success ? undefined : 'email_send_failed',
      dedupeKey,
      payload: {
        ...payload,
        recipientEmail: recipient.email,
        providerError: emailResult.success ? undefined : emailResult.error,
      },
    })

    return {
      success: emailResult.success,
      skipped: false,
      reason: emailResult.success ? undefined : 'email_send_failed',
    }
  } catch (error) {
    logger.error('Friend request notification email processing failed', error as Error, {
      requestId: input.requestId,
      senderId: input.sender.id,
      receiverId: recipient.id,
    })

    await recordNotificationDelivery({
      userId: recipient.id,
      type: 'friend_request',
      status: 'failed',
      reason: 'friend_request_notification_processing_error',
      dedupeKey,
      payload: {
        ...payload,
        recipientEmail: recipient.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    return { success: false, skipped: false, reason: 'processing_error' }
  }
}

export async function sendFriendAcceptedNotificationEmail(
  input: SendFriendAcceptedNotificationEmailInput
): Promise<FriendNotificationResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const recipient = input.requester
  const accepterName = input.accepter.username || 'Player'
  const dedupeKey = input.requestId
    ? `friend_accepted:request:${input.requestId}:recipient:${recipient.id}`
    : `friend_accepted:recipient:${recipient.id}:accepter:${input.accepter.id}`

  const payload = {
    requestId: input.requestId,
    friendshipId: input.friendshipId,
    accepterId: input.accepter.id,
    accepterName,
    requesterId: recipient.id,
    requesterName: recipient.username || null,
  }

  if (!recipient.email) {
    await recordNotificationDelivery({
      userId: recipient.id,
      type: 'friend_accepted',
      status: 'skipped',
      reason: 'missing_recipient_email',
      dedupeKey,
      payload,
    })
    return { success: false, skipped: true, reason: 'missing_recipient_email' }
  }

  try {
    const prefs = await getNotificationPreferences(recipient.id)
    if (prefs.unsubscribedAll || !prefs.friendAccepted) {
      const reason = prefs.unsubscribedAll ? 'unsubscribed_all' : 'friend_accepted_disabled'
      await recordNotificationDelivery({
        userId: recipient.id,
        type: 'friend_accepted',
        status: 'skipped',
        reason,
        dedupeKey,
        payload,
      })
      return { success: false, skipped: true, reason }
    }

    const token = createNotificationUnsubscribeToken({
      userId: recipient.id,
      type: 'friendAccepted',
    })
    const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
    const profileUrl = `${baseUrl}/profile`

    const emailResult = await sendFriendAcceptedEmail({
      email: recipient.email,
      recipientName: recipient.username,
      accepterName,
      profileUrl,
      unsubscribeUrl,
    })

    await recordNotificationDelivery({
      userId: recipient.id,
      type: 'friend_accepted',
      status: emailResult.success ? 'sent' : 'failed',
      reason: emailResult.success ? undefined : 'email_send_failed',
      dedupeKey,
      payload: {
        ...payload,
        recipientEmail: recipient.email,
        providerError: emailResult.success ? undefined : emailResult.error,
      },
    })

    return {
      success: emailResult.success,
      skipped: false,
      reason: emailResult.success ? undefined : 'email_send_failed',
    }
  } catch (error) {
    logger.error('Friend accepted notification email processing failed', error as Error, {
      requestId: input.requestId,
      friendshipId: input.friendshipId,
      accepterId: input.accepter.id,
      requesterId: recipient.id,
    })

    await recordNotificationDelivery({
      userId: recipient.id,
      type: 'friend_accepted',
      status: 'failed',
      reason: 'friend_accepted_notification_processing_error',
      dedupeKey,
      payload: {
        ...payload,
        recipientEmail: recipient.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    return { success: false, skipped: false, reason: 'processing_error' }
  }
}
