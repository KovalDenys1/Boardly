import { Prisma, type NotificationType } from '@prisma/client'
import { prisma } from './db'
import { getNotificationPreferences } from './notification-preferences'

type InAppPayload = Record<string, unknown>

type CreateInAppNotificationInput = {
  userId: string
  type: NotificationType
  dedupeKey?: string
  payload?: InAppPayload
}

export async function createInAppNotification(input: CreateInAppNotificationInput) {
  const preferences = await getNotificationPreferences(input.userId)
  if (!preferences.inAppNotifications) {
    return { created: false, id: null, skipped: true, reason: 'in_app_disabled' as const }
  }

  if (input.dedupeKey) {
    const existing = await prisma.notifications.findFirst({
      where: {
        userId: input.userId,
        channel: 'in_app',
        dedupeKey: input.dedupeKey,
      },
      select: { id: true },
    })

    if (existing) {
      return { created: false, id: existing.id }
    }
  }

  const now = new Date()
  const notification = await prisma.notifications.create({
    data: {
      userId: input.userId,
      type: input.type,
      channel: 'in_app',
      status: 'sent',
      dedupeKey: input.dedupeKey ?? null,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      processedAt: now,
      sentAt: now,
    },
    select: {
      id: true,
    },
  })

  return { created: true, id: notification.id }
}

export async function markInAppNotificationsRead(userId: string, notificationIds: string[]) {
  if (notificationIds.length === 0) {
    return { count: 0 }
  }

  const now = new Date()
  return prisma.notifications.updateMany({
    where: {
      userId,
      channel: 'in_app',
      id: { in: notificationIds },
      readAt: null,
    },
    data: {
      readAt: now,
    },
  })
}

export async function markAllInAppNotificationsRead(userId: string) {
  const now = new Date()
  return prisma.notifications.updateMany({
    where: {
      userId,
      channel: 'in_app',
      readAt: null,
    },
    data: {
      readAt: now,
    },
  })
}

export async function markInAppNotificationReadByDedupeKey(userId: string, dedupeKey: string) {
  const now = new Date()
  return prisma.notifications.updateMany({
    where: {
      userId,
      channel: 'in_app',
      dedupeKey,
      readAt: null,
    },
    data: {
      readAt: now,
    },
  })
}
