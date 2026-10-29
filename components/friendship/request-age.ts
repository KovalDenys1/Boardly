const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** "today", "yesterday", "3 days ago" for the last week, then a short date, in the page's language. */
export function formatRequestAge(createdAt: string, locale: string | undefined, now = Date.now()): string {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return ''

  const days = Math.round((startOfDay(now) - startOfDay(created)) / DAY_MS)
  if (days >= 0 && days < 7) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(created)
}
