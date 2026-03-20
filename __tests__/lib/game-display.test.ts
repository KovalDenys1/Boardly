import { getGameStatusBadgeColor } from '@/lib/game-display'

describe('getGameStatusBadgeColor', () => {
  it('uses a higher-contrast palette for cancelled games', () => {
    expect(getGameStatusBadgeColor('cancelled')).toBe(
      'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-500/30'
    )
  })
})
