import jwt from 'jsonwebtoken'

export type NotificationPreferenceKey =
  | 'gameInvites'
  | 'turnReminders'
  | 'friendRequests'
  | 'friendAccepted'
  | 'marketingConsent'

function getNotificationSecret(): string {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is required for notification unsubscribe tokens')
  }
  return process.env.NEXTAUTH_SECRET
}

type UnsubscribeTokenPayload = {
  userId: string
  type: NotificationPreferenceKey | 'all'
}

export function createNotificationUnsubscribeToken(payload: UnsubscribeTokenPayload): string {
  return jwt.sign(payload, getNotificationSecret(), {
    expiresIn: '30d',
    issuer: 'boardly.notifications',
    audience: 'boardly.unsubscribe',
  })
}

export function verifyNotificationUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getNotificationSecret(), {
      issuer: 'boardly.notifications',
      audience: 'boardly.unsubscribe',
    }) as UnsubscribeTokenPayload

    if (!decoded?.userId || !decoded?.type) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

/** The signed link that turns one kind of mail off without signing in; it expires in 30 days. */
export function notificationUnsubscribeUrl(userId: string, type: NotificationPreferenceKey): string {
  const token = createNotificationUnsubscribeToken({ userId, type })
  const baseUrl = process.env.NEXTAUTH_URL || 'https://boardly.online'
  return `${baseUrl}/api/notifications/unsubscribe?token=${token}`
}

/**
 * `List-Unsubscribe` (RFC 2369) plus the one-click variant, RFC 8058: mail clients that see
 * both headers show their own "Unsubscribe" action and, for List-Unsubscribe-Post, POST
 * `List-Unsubscribe=One-Click` straight to the URL with no page load and no further click.
 */
export function unsubscribeHeaders(unsubscribeUrl: string): {
  'List-Unsubscribe': string
  'List-Unsubscribe-Post': string
} {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/** Every marketing template must send these, so the header is never missing on the first send. */
export function buildMarketingUnsubscribeHeaders(userId: string) {
  return unsubscribeHeaders(notificationUnsubscribeUrl(userId, 'marketingConsent'))
}
