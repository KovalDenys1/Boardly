import {
  formatCompactDuration,
  getGameDurationMs,
  getGameEndedAt,
  getGameStatusBadgeColor,
} from '@/lib/game-display'

describe('getGameStatusBadgeColor', () => {
  it('uses a higher-contrast palette for cancelled games', () => {
    expect(getGameStatusBadgeColor('cancelled')).toBe(
      'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-500/30'
    )
  })
})

describe('getGameEndedAt', () => {
  it('prefers abandonedAt for cancelled and abandoned games', () => {
    const updatedAt = new Date('2026-03-01T10:10:00.000Z')
    const abandonedAt = new Date('2026-03-01T10:06:00.000Z')

    expect(getGameEndedAt('cancelled', updatedAt, abandonedAt)?.toISOString()).toBe(
      '2026-03-01T10:06:00.000Z'
    )
    expect(getGameEndedAt('abandoned', updatedAt, abandonedAt)?.toISOString()).toBe(
      '2026-03-01T10:06:00.000Z'
    )
  })

  it('falls back to updatedAt for finished games', () => {
    expect(
      getGameEndedAt('finished', '2026-03-01T10:10:00.000Z', '2026-03-01T10:06:00.000Z')?.toISOString()
    ).toBe('2026-03-01T10:10:00.000Z')
  })
})

describe('getGameDurationMs', () => {
  it('returns a non-negative duration between created and ended timestamps', () => {
    expect(
      getGameDurationMs('2026-03-01T10:00:00.000Z', '2026-03-01T10:10:00.000Z')
    ).toBe(10 * 60 * 1000)
  })

  it('returns null when timestamps are missing', () => {
    expect(getGameDurationMs(null, '2026-03-01T10:10:00.000Z')).toBeNull()
  })
})

describe('formatCompactDuration', () => {
  it('formats short english durations compactly', () => {
    expect(formatCompactDuration(10 * 60 * 1000, 'en-US')).toBe('10m')
    expect(formatCompactDuration((2 * 60 + 5) * 60 * 1000, 'en-US')).toBe('2h 5m')
  })

  it('formats russian minute durations with localized units', () => {
    expect(formatCompactDuration(10 * 60 * 1000, 'ru-RU')).toBe('10 мин')
  })
})
