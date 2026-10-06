import { prisma } from './db'
import type { NotificationPreferenceKey } from './unsubscribe-token'

export {
  buildMarketingUnsubscribeHeaders,
  createNotificationUnsubscribeToken,
  verifyNotificationUnsubscribeToken,
} from './unsubscribe-token'

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

export async function isNotificationEnabled(
  userId: string,
  type: NotificationPreferenceKey
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId)
  if (prefs.unsubscribedAll) return false
  return prefs[type]
}
