import jwt from 'jsonwebtoken'
import { prisma } from './db'

export type NotificationPreferenceSnapshot = {
  inAppNotifications: boolean
  gameInvites: boolean
  turnReminders: boolean
  friendRequests: boolean
  friendAccepted: boolean
  pushNotifications: boolean
  unsubscribedAll: boolean
  // #1154: opt-in, unticked by default (see the migration for why). Kept apart from
  // unsubscribedAll: that field silences service-adjacent notifications a user asked
  // for, this one is the marketing-email lawful basis and must default to false, not
  // follow whatever unsubscribedAll happens to be.
  marketingConsent: boolean
  marketingConsentAt: Date | null
}

type NotificationPreferenceKey =
  | 'gameInvites'
  | 'turnReminders'
  | 'friendRequests'
  | 'friendAccepted'
  | 'marketingConsent'

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferenceSnapshot> {
  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: {
      inAppNotifications: true,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      pushNotifications: true,
      unsubscribedAll: true,
      marketingConsent: true,
      marketingConsentAt: true,
    },
  })

  return (
    prefs ?? {
      inAppNotifications: true,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      pushNotifications: false,
      unsubscribedAll: false,
      marketingConsent: false,
      marketingConsentAt: null,
    }
  )
}

export async function upsertNotificationPreferences(
  userId: string,
  data: Partial<NotificationPreferenceSnapshot>
): Promise<NotificationPreferenceSnapshot> {
  // marketingConsentAt is the evidence a consent question needs, so it is stamped here,
  // once, whenever the consent value itself changes — never left to the table's own
  // updatedAt, which any other preference in the same object also bumps, and never left
  // to a caller to remember (registration and the profile toggle both go through this).
  const writeData: Partial<NotificationPreferenceSnapshot> =
    'marketingConsent' in data ? { ...data, marketingConsentAt: new Date() } : data

  const prefs = await prisma.notificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      ...writeData,
    },
    update: writeData,
    select: {
      inAppNotifications: true,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      pushNotifications: true,
      unsubscribedAll: true,
      marketingConsent: true,
      marketingConsentAt: true,
    },
  })

  return prefs
}

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

/**
 * `List-Unsubscribe` (RFC 2369) plus the one-click variant, RFC 8058: mail clients that see
 * both headers show their own "Unsubscribe" action and, for List-Unsubscribe-Post, POST
 * `List-Unsubscribe=One-Click` straight to the URL with no page load and no further click —
 * `POST /api/notifications/unsubscribe` performs the same preference change as the existing
 * GET link for exactly that reason.
 *
 * No marketing template calls this yet (#1154 ships the consent capture and the unsubscribe
 * path with nothing sending marketing mail); every future one must, so the header is never
 * missing on the first send.
 */
export function buildMarketingUnsubscribeHeaders(userId: string): {
  'List-Unsubscribe': string
  'List-Unsubscribe-Post': string
} {
  const token = createNotificationUnsubscribeToken({ userId, type: 'marketingConsent' })
  const baseUrl = process.env.NEXTAUTH_URL || 'https://boardly.online'
  const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe?token=${token}`

  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

export async function isNotificationEnabled(
  userId: string,
  type: NotificationPreferenceKey
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId)
  if (prefs.unsubscribedAll) return false
  return prefs[type]
}
