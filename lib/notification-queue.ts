import { Prisma } from '@/prisma/client'
import { prisma } from './db'
import { logger } from './logger'
import {
  createNotificationUnsubscribeToken,
  getNotificationPreferences,
} from './notification-preferences'
import {
  sendFriendAcceptedEmail,
  sendFriendRequestDigestEmail,
  sendFriendRequestEmail,
} from './email'
import type { NotificationEmailType } from './notifications-log'

type QueueStatus = 'queued' | 'processing' | 'sent' | 'skipped' | 'failed'

type EnqueueEmailNotificationInput = {
  userId: string
  type: NotificationEmailType
  dedupeKey?: string
  payload?: Record<string, unknown>
}

type ProcessNotificationQueueOptions = {
  now?: Date
  baseUrl?: string
  batchLimit?: number
}

export type ProcessNotificationQueueResult = {
  success: boolean
  claimed: number
  processed: number
  sent: number
  skipped: number
  failed: number
  batchedDigestsSent: number
}

type QueuedNotificationRow = {
  id: string
  userId: string
  type: string
  status: string
  dedupeKey: string | null
  payload: unknown
  createdAt: Date
}

type FriendRequestQueuePayload = {
  requestId?: string
  source?: 'username' | 'friend_code'
  senderId: string
  senderName: string
  receiverId: string
  receiverName?: string | null
  recipientEmail?: string | null
}

type FriendAcceptedQueuePayload = {
  requestId?: string
  friendshipId?: string
  accepterId: string
  accepterName: string
  requesterId: string
  requesterName?: string | null
  recipientEmail?: string | null
}

function normalizeBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000').trim()
  return raw.replace(/\/+$/, '')
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getBatchLimit(options: ProcessNotificationQueueOptions): number {
  return options.batchLimit ?? parsePositiveInt(process.env.NOTIFICATION_QUEUE_BATCH_LIMIT, 100)
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function toFriendRequestPayload(value: unknown): FriendRequestQueuePayload | null {
  const obj = asObject(value)
  if (!obj) return null
  if (typeof obj.senderId !== 'string' || typeof obj.senderName !== 'string' || typeof obj.receiverId !== 'string') {
    return null
  }
  return {
    requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
    source: obj.source === 'friend_code' ? 'friend_code' : 'username',
    senderId: obj.senderId,
    senderName: obj.senderName,
    receiverId: obj.receiverId,
    receiverName: typeof obj.receiverName === 'string' ? obj.receiverName : null,
    recipientEmail: typeof obj.recipientEmail === 'string' ? obj.recipientEmail : null,
  }
}

function toFriendAcceptedPayload(value: unknown): FriendAcceptedQueuePayload | null {
  const obj = asObject(value)
  if (!obj) return null
  if (
    typeof obj.accepterId !== 'string' ||
    typeof obj.accepterName !== 'string' ||
    typeof obj.requesterId !== 'string'
  ) {
    return null
  }
  return {
    requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
    friendshipId: typeof obj.friendshipId === 'string' ? obj.friendshipId : undefined,
    accepterId: obj.accepterId,
    accepterName: obj.accepterName,
    requesterId: obj.requesterId,
    requesterName: typeof obj.requesterName === 'string' ? obj.requesterName : null,
    recipientEmail: typeof obj.recipientEmail === 'string' ? obj.recipientEmail : null,
  }
}

async function updateQueueRows(ids: string[], status: QueueStatus, reason?: string) {
  if (ids.length === 0) return
  const now = new Date()
  await prisma.notifications.updateMany({
    where: {
      id: { in: ids },
    },
    data: {
      status,
      reason: reason ?? null,
      processedAt: now,
      sentAt: status === 'sent' ? now : null,
      updatedAt: now,
    },
  })
}

async function updateQueueRow(
  id: string,
  status: QueueStatus,
  params?: {
    reason?: string
    payloadPatch?: Record<string, unknown>
  }
) {
  const now = new Date()
  const data: Record<string, unknown> = {
    status,
    reason: params?.reason ?? null,
    processedAt: now,
    sentAt: status === 'sent' ? now : null,
    updatedAt: now,
  }

  if (params?.payloadPatch) {
    data.payload = params.payloadPatch as Prisma.InputJsonValue
  }

  await prisma.notifications.update({
    where: { id },
    data,
  })
}

export async function enqueueEmailNotification(
  input: EnqueueEmailNotificationInput
): Promise<{ queued: boolean; skipped?: boolean; reason?: string }> {
  if (input.dedupeKey) {
    const existingQueued = await prisma.notifications.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        channel: 'email',
        dedupeKey: input.dedupeKey,
        status: {
          in: ['queued', 'processing'],
        },
      },
      select: { id: true },
    })

    if (existingQueued) {
      return { queued: false, skipped: true, reason: 'duplicate_queued' }
    }
  }

  await prisma.notifications.create({
    data: {
      userId: input.userId,
      type: input.type,
      channel: 'email',
      status: 'queued',
      dedupeKey: input.dedupeKey ?? null,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })

  return { queued: true }
}

async function processFriendAcceptedNotification(
  row: QueuedNotificationRow,
  baseUrl: string,
  result: ProcessNotificationQueueResult
) {
  const payload = toFriendAcceptedPayload(row.payload)
  if (!payload) {
    result.failed += 1
    result.processed += 1
    await updateQueueRow(row.id, 'failed', { reason: 'invalid_payload' })
    return
  }

  if (!payload.recipientEmail) {
    result.skipped += 1
    result.processed += 1
    await updateQueueRow(row.id, 'skipped', { reason: 'missing_recipient_email' })
    return
  }

  const prefs = await getNotificationPreferences(row.userId)
  if (prefs.unsubscribedAll || !prefs.friendAccepted) {
    result.skipped += 1
    result.processed += 1
    await updateQueueRow(row.id, 'skipped', {
      reason: prefs.unsubscribedAll ? 'unsubscribed_all' : 'friend_accepted_disabled',
    })
    return
  }

  const token = createNotificationUnsubscribeToken({
    userId: row.userId,
    type: 'friendAccepted',
  })
  const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
  const profileUrl = `${baseUrl}/profile`

  const emailResult = await sendFriendAcceptedEmail({
    email: payload.recipientEmail,
    recipientName: payload.requesterName ?? null,
    accepterName: payload.accepterName,
    profileUrl,
    unsubscribeUrl,
  })

  result.processed += 1
  if (emailResult.success) {
    result.sent += 1
    await updateQueueRow(row.id, 'sent')
  } else {
    result.failed += 1
    await updateQueueRow(row.id, 'failed', { reason: 'email_send_failed' })
  }
}

async function processFriendRequestGroup(
  rows: QueuedNotificationRow[],
  baseUrl: string,
  result: ProcessNotificationQueueResult
) {
  if (rows.length === 0) return

  const parsed = rows
    .map((row) => ({ row, payload: toFriendRequestPayload(row.payload) }))
    .filter((entry) => !!entry.payload) as Array<{ row: QueuedNotificationRow; payload: FriendRequestQueuePayload }>

  const invalidRows = rows.filter((row) => !parsed.find((entry) => entry.row.id === row.id))
  if (invalidRows.length > 0) {
    result.failed += invalidRows.length
    result.processed += invalidRows.length
    await updateQueueRows(invalidRows.map((row) => row.id), 'failed', 'invalid_payload')
  }

  if (parsed.length === 0) {
    return
  }

  const userId = rows[0].userId
  const recipientEmail = parsed[0].payload.recipientEmail || null
  const recipientName = parsed[0].payload.receiverName || null
  const rowIds = parsed.map((entry) => entry.row.id)

  if (!recipientEmail) {
    result.skipped += parsed.length
    result.processed += parsed.length
    await updateQueueRows(rowIds, 'skipped', 'missing_recipient_email')
    return
  }

  const prefs = await getNotificationPreferences(userId)
  if (prefs.unsubscribedAll || !prefs.friendRequests) {
    result.skipped += parsed.length
    result.processed += parsed.length
    await updateQueueRows(
      rowIds,
      'skipped',
      prefs.unsubscribedAll ? 'unsubscribed_all' : 'friend_requests_disabled'
    )
    return
  }

  const token = createNotificationUnsubscribeToken({
    userId,
    type: 'friendRequests',
  })
  const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
  const profileUrl = `${baseUrl}/profile`

  const uniqueSenderNames = Array.from(
    new Set(parsed.map((entry) => entry.payload.senderName).filter(Boolean))
  )

  const emailResult =
    parsed.length > 1
      ? await sendFriendRequestDigestEmail({
          email: recipientEmail,
          recipientName,
          profileUrl,
          unsubscribeUrl,
          requestCount: parsed.length,
          senderNames: uniqueSenderNames,
        })
      : await sendFriendRequestEmail({
          email: recipientEmail,
          recipientName,
          senderName: parsed[0].payload.senderName,
          profileUrl,
          unsubscribeUrl,
        })

  result.processed += parsed.length
  if (emailResult.success) {
    result.sent += parsed.length
    if (parsed.length > 1) {
      result.batchedDigestsSent += 1
    }
    await updateQueueRows(rowIds, 'sent')
  } else {
    result.failed += parsed.length
    await updateQueueRows(rowIds, 'failed', 'email_send_failed')
  }
}

export async function processNotificationEmailQueue(
  options: ProcessNotificationQueueOptions = {}
): Promise<ProcessNotificationQueueResult> {
  const now = options.now ?? new Date()
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const batchLimit = getBatchLimit(options)

  const queuedRows = (await prisma.notifications.findMany({
    where: {
      channel: 'email',
      status: 'queued',
      type: {
        in: ['friend_request', 'friend_accepted'],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: batchLimit,
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      dedupeKey: true,
      payload: true,
      createdAt: true,
    },
  })) as QueuedNotificationRow[]

  if (queuedRows.length === 0) {
    return {
      success: true,
      claimed: 0,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      batchedDigestsSent: 0,
    }
  }

  const rowIds = queuedRows.map((row) => row.id)
  await prisma.notifications.updateMany({
    where: {
      id: { in: rowIds },
      status: 'queued',
    },
    data: {
      status: 'processing',
      processedAt: now,
      updatedAt: now,
    },
  })

  const claimedRows = (await prisma.notifications.findMany({
    where: {
      id: { in: rowIds },
      status: 'processing',
      channel: 'email',
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      dedupeKey: true,
      payload: true,
      createdAt: true,
    },
  })) as QueuedNotificationRow[]

  const result: ProcessNotificationQueueResult = {
    success: true,
    claimed: claimedRows.length,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    batchedDigestsSent: 0,
  }

  const friendRequestGroups = new Map<string, QueuedNotificationRow[]>()
  const remainingRows: QueuedNotificationRow[] = []

  for (const row of claimedRows) {
    if (row.type === 'friend_request') {
      const key = row.userId
      const group = friendRequestGroups.get(key) || []
      group.push(row)
      friendRequestGroups.set(key, group)
      continue
    }
    remainingRows.push(row)
  }

  for (const groupRows of friendRequestGroups.values()) {
    try {
      await processFriendRequestGroup(groupRows, baseUrl, result)
    } catch (error) {
      result.success = false
      result.failed += groupRows.length
      result.processed += groupRows.length
      await updateQueueRows(groupRows.map((row) => row.id), 'failed', 'queue_processing_error')
      logger.error('Friend request queue group processing failed', error as Error, {
        userId: groupRows[0]?.userId,
        count: groupRows.length,
      })
    }
  }

  for (const row of remainingRows) {
    try {
      if (row.type === 'friend_accepted') {
        await processFriendAcceptedNotification(row, baseUrl, result)
        continue
      }

      result.skipped += 1
      result.processed += 1
      await updateQueueRow(row.id, 'skipped', { reason: 'unsupported_queue_type' })
    } catch (error) {
      result.success = false
      result.failed += 1
      result.processed += 1
      await updateQueueRow(row.id, 'failed', { reason: 'queue_processing_error' })
      logger.error('Notification queue row processing failed', error as Error, {
        notificationId: row.id,
        type: row.type,
        userId: row.userId,
      })
    }
  }

  if (result.failed > 0) {
    result.success = false
  }

  logger.info('Notification email queue processed', {
    claimed: result.claimed,
    processed: result.processed,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    batchedDigestsSent: result.batchedDigestsSent,
    batchLimit,
  })

  return result
}
