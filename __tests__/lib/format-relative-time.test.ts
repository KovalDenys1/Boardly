import { formatRelativeTime } from '@/lib/format-relative-time'

const now = Date.UTC(2026, 9, 13, 12, 0, 0)
const ago = (ms: number) => new Date(now - ms).toISOString()

describe('formatRelativeTime', () => {
  it('counts minutes, hours and days back within a week', () => {
    expect(formatRelativeTime(ago(20_000), 'en', now)).toBe('now')
    expect(formatRelativeTime(ago(5 * 60_000), 'en', now)).toBe('5 minutes ago')
    expect(formatRelativeTime(ago(3 * 3_600_000), 'en', now)).toBe('3 hours ago')
    expect(formatRelativeTime(ago(2 * 86_400_000), 'en', now)).toBe('2 days ago')
    expect(formatRelativeTime(ago(26 * 3_600_000), 'en', now)).toBe('yesterday')
  })

  it('falls back to the date past a week, with the year only when it differs', () => {
    expect(formatRelativeTime(ago(10 * 86_400_000), 'en', now)).toBe('Oct 3')
    expect(formatRelativeTime('2025-12-24T10:00:00.000Z', 'en', now)).toBe('Dec 24, 2025')
  })

  it('speaks the given locale and survives a bad date', () => {
    expect(formatRelativeTime(ago(3 * 3_600_000), 'ru', now)).toBe('3 часа назад')
    expect(formatRelativeTime('nope', 'en', now)).toBe('')
  })
})
