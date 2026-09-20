import { ANALYTICS_GAME_TYPES, toAnalyticsGameType } from '@/lib/analytics-game-types'
import { getSupportedGameTypes } from '@/lib/game-registry'

/**
 * #1044: two call sites kept their own hardcoded copies of the analytics game-type
 * list and both fell behind it, so Connect Four was reported as Yahtzee. These tests
 * exist to make that class of bug loud rather than silent, so they assert the property
 * that was violated — every game the product knows about survives narrowing — rather
 * than pinning today's list.
 */
describe('analytics game types', () => {
  it('narrows every member of its own list to itself', () => {
    for (const type of ANALYTICS_GAME_TYPES) {
      expect(toAnalyticsGameType(type)).toBe(type)
    }
  })

  it('rejects anything that is not a known game type', () => {
    for (const value of ['', 'chess', 'Yahtzee', 'tic-tac-toe', null, undefined, 42, {}, []]) {
      expect(toAnalyticsGameType(value)).toBeUndefined()
    }
  })

  it('covers every game the registry supports', () => {
    // A game you can play is a game you should be able to measure. Adding one to the
    // registry but not here is exactly the failure #1044 describes: the value is not
    // dropped, it is silently relabelled as the caller's fallback, which inflates one
    // game and erases another. If this fails after a game is enabled, the fix is to add
    // it to ANALYTICS_GAME_TYPES, not to narrow this assertion.
    const missing = getSupportedGameTypes().filter((type) => toAnalyticsGameType(type) === undefined)

    expect(missing).toEqual([])
  })
})
