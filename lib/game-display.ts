export function formatGameTypeLabel(gameType: string): string {
  switch (gameType) {
    case 'yahtzee':
      return 'Yahtzee'
    case 'guess_the_spy':
      return 'Guess the Spy'
    case 'tic_tac_toe':
      return 'Tic Tac Toe'
    case 'rock_paper_scissors':
      return 'Rock Paper Scissors'
    case 'memory':
      return 'Memory'
    default:
      return gameType
  }
}

export function getGameStatusBadgeColor(status: string): string {
  switch (status) {
    case 'finished':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'playing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'abandoned':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    case 'cancelled':
      return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-500/30'
    default:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
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
