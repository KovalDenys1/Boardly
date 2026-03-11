import jwt from 'jsonwebtoken'
import { prisma } from './db'

export type NotificationPreferenceSnapshot = {
  inAppNotifications: boolean
  gameInvites: boolean
  turnReminders: boolean
  friendRequests: boolean
  friendAccepted: boolean
  unsubscribedAll: boolean
}

type NotificationPreferenceKey =
  | 'gameInvites'
  | 'turnReminders'
  | 'friendRequests'
  | 'friendAccepted'

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferenceSnapshot> {
  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: {
      inAppNotifications: true,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: true,
    },
  })

  return (
    prefs ?? {
      inAppNotifications: true,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: false,
    }
  )
}

export async function upsertNotificationPreferences(
  userId: string,
  data: Partial<NotificationPreferenceSnapshot>
): Promise<NotificationPreferenceSnapshot> {
  const prefs = await prisma.notificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
    },
    update: data,
    select: {
      inAppNotifications: true,
      gameInvites: true,
      turnReminders: true,
      friendRequests: true,
      friendAccepted: true,
      unsubscribedAll: true,
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

export async function isNotificationEnabled(
  userId: string,
  type: NotificationPreferenceKey
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId)
  if (prefs.unsubscribedAll) return false
  return prefs[type]
}
