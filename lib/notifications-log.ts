import { prisma } from './db'

export type NotificationEmailType =
  | 'game_invite'
  | 'turn_reminder'
  | 'friend_request'
  | 'friend_accepted'

export type NotificationDeliveryStatus = 'queued' | 'sent' | 'skipped' | 'failed'

type NotificationsModelLike = {
  create: (args: Record<string, unknown>) => Promise<unknown>
  findFirst?: (args: Record<string, unknown>) => Promise<unknown>
}

type RecordNotificationDeliveryInput = {
  userId: string
  type: NotificationEmailType
  status: NotificationDeliveryStatus
  dedupeKey?: string
  reason?: string
  payload?: Record<string, unknown>
  sentAt?: Date | null
  processedAt?: Date | null
}

/**
 * Lightweight notification delivery log.
 * This acts as the foundation for future queueing/rate-limiting logic.
 */
export async function recordNotificationDelivery(
  input: RecordNotificationDeliveryInput
): Promise<void> {
  const notificationsModel = (prisma as unknown as {
    notifications?: NotificationsModelLike
  }).notifications

  // Some tests mock a partial Prisma client and may not include this model.
  if (!notificationsModel?.create) {
    return
  }

  const processedAt = input.processedAt ?? new Date()
  const sentAt = input.status === 'sent' ? (input.sentAt ?? processedAt) : (input.sentAt ?? null)

  try {
    await notificationsModel.create({
      data: {
        userId: input.userId,
        type: input.type,
        channel: 'email',
        status: input.status,
        dedupeKey: input.dedupeKey ?? null,
        reason: input.reason ?? null,
        payload: input.payload ?? undefined,
        processedAt,
        sentAt,
      },
    })
  } catch {
    // Best-effort logging: notification delivery should not fail the parent flow.
  }
}

type HasRecentSentNotificationInput = {
  userId: string
  type: NotificationEmailType
  dedupeKey?: string
  since: Date
}

export async function hasRecentSentNotification(
  input: HasRecentSentNotificationInput
): Promise<boolean> {
  const notificationsModel = (prisma as unknown as {
    notifications?: NotificationsModelLike
  }).notifications

  if (!notificationsModel?.findFirst) {
    return false
  }

  try {
    const recent = await notificationsModel.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        channel: 'email',
        status: 'sent',
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        sentAt: {
          gte: input.since,
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        sentAt: 'desc',
      },
    })

    return !!recent
  } catch {
    return false
  }
}
