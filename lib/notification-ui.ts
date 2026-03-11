'use client'

import { formatGameTypeLabel } from '@/lib/game-display'
import type { TranslationKeys } from '@/lib/i18n-helpers'

export type InAppNotificationItem = {
  id: string
  type: 'game_invite' | 'turn_reminder' | 'friend_request' | 'friend_accepted'
  createdAt: string
  readAt: string | null
  payload: unknown
}

export type InAppNotificationResponse = {
  notifications: InAppNotificationItem[]
  unreadCount: number
  hasMore?: boolean
}

type Translator = (
  key: TranslationKeys,
  options?: string | Record<string, unknown>
) => string

type NotificationPayload = Record<string, unknown> | null

export type NotificationTone = 'blue' | 'emerald' | 'violet' | 'amber'

export type NotificationDisplayItem = InAppNotificationItem & {
  href: string
  subtitle: string | null
  title: string
  timestamp: string
  tone: NotificationTone
}

function asRecord(value: unknown): NotificationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readString(value: NotificationPayload, key: string): string | null {
  const candidate = value?.[key]
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

export function formatNotificationTime(value: string, locale?: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString(locale || undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function mapNotificationTone(
  type: InAppNotificationItem['type']
): NotificationTone {
  switch (type) {
    case 'friend_request':
      return 'blue'
    case 'friend_accepted':
      return 'emerald'
    case 'game_invite':
      return 'violet'
    case 'turn_reminder':
      return 'amber'
  }
}

export function buildNotificationDisplayItem(
  item: InAppNotificationItem,
  t: Translator,
  locale?: string
): NotificationDisplayItem {
  const payload = asRecord(item.payload)
  const actorName =
    readString(payload, 'senderName') ||
    readString(payload, 'accepterName') ||
    t('profile.playerFallback')
  const gameType = readString(payload, 'gameType')
  const gameLabel = gameType
    ? formatGameTypeLabel(gameType)
    : t('header.notificationDefaultGame')
  const inviteType = readString(payload, 'inviteType')
  const href =
    readString(payload, 'href') ||
    (item.type === 'friend_request' || item.type === 'friend_accepted'
      ? '/profile?tab=friends'
      : '/')

  let title = t('header.notificationsItems.default')
  let subtitle: string | null = null

  switch (item.type) {
    case 'friend_request':
      title = t('header.notificationsItems.friendRequest', { name: actorName })
      break
    case 'friend_accepted':
      title = t('header.notificationsItems.friendAccepted', { name: actorName })
      break
    case 'game_invite':
      title =
        inviteType === 'rematch'
          ? t('header.notificationsItems.rematchInvite', {
              name: actorName,
              game: gameLabel,
            })
          : t('header.notificationsItems.gameInvite', {
              name: actorName,
              game: gameLabel,
            })
      subtitle = readString(payload, 'lobbyName')
      break
    case 'turn_reminder':
      title = t('header.notificationsItems.turnReminder', { game: gameLabel })
      subtitle = readString(payload, 'lobbyName')
      break
  }

  return {
    ...item,
    href,
    subtitle,
    title,
    timestamp: formatNotificationTime(item.createdAt, locale),
    tone: mapNotificationTone(item.type),
  }
}
