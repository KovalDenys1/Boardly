import { getGameMetadata } from '@/lib/game-catalog'

export function formatGameTypeLabel(gameType: string): string {
  return getGameMetadata(gameType)?.name ?? gameType
}

export function getGameStatusBadgeColor(status: string): string {
  switch (status) {
    // bd-* tokens (#1255). One mapping for every status chip: game history, the replay
    // viewer and the results modal used to carry three diverging copies.
    case 'finished':
      return 'bg-bd-mint/20 text-bd-ink'
    case 'playing':
      return 'bg-bd-sun/25 text-bd-ink'
    case 'abandoned':
      return 'bg-bd-coral/15 text-bd-ink'
    case 'cancelled':
      return 'bg-bd-bg2 text-bd-ink-soft'
    default:
      return 'bg-bd-lav/20 text-bd-ink'
  }
}

type GameTimestampValue = Date | string | null | undefined

function toDate(value: GameTimestampValue): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getGameEndedAt(
  status: string,
  updatedAt: GameTimestampValue,
  abandonedAt?: GameTimestampValue
): Date | null {
  const updatedAtDate = toDate(updatedAt)
  const abandonedAtDate = toDate(abandonedAt)

  if (status === 'abandoned' || status === 'cancelled') {
    return abandonedAtDate || updatedAtDate
  }

  return updatedAtDate
}

export function getGameDurationMs(
  createdAt: GameTimestampValue,
  endedAt: GameTimestampValue
): number | null {
  const createdAtDate = toDate(createdAt)
  const endedAtDate = toDate(endedAt)

  if (!createdAtDate || !endedAtDate) return null

  return Math.max(0, endedAtDate.getTime() - createdAtDate.getTime())
}

export function formatCompactDuration(durationMs: number | null | undefined, locale = 'en-US'): string {
  if (durationMs === null || durationMs === undefined) return '-'

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const secondFormatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'narrow',
  })

  if (totalSeconds < 60) {
    return secondFormatter.format(totalSeconds)
  }

  const totalMinutes = Math.floor(totalSeconds / 60)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const dayFormatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'day',
    unitDisplay: 'narrow',
  })
  const hourFormatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'hour',
    unitDisplay: 'narrow',
  })
  const minuteFormatter = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'narrow',
  })

  const parts: string[] = []
  if (days > 0) parts.push(dayFormatter.format(days))
  if (hours > 0) parts.push(hourFormatter.format(hours))
  if (minutes > 0 || parts.length === 0) parts.push(minuteFormatter.format(minutes))

  return parts.slice(0, 2).join(' ')
}
