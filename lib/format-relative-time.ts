const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "2 hours ago" up to a week back, then the date. */
export function formatRelativeTime(iso: string, locale: string, now: number = Date.now()): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const diff = now - time
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (diff < MINUTE) return rtf.format(0, 'second')
  if (diff < HOUR) return rtf.format(-Math.round(diff / MINUTE), 'minute')
  if (diff < DAY) return rtf.format(-Math.round(diff / HOUR), 'hour')
  if (diff < 7 * DAY) return rtf.format(-Math.round(diff / DAY), 'day')

  const date = new Date(time)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
