import {
  clampMaxPlayersForGame,
  clampPlayerLimits,
  createGameEngine,
  getGameMetadata,
  getSupportedGameTypes,
} from '@/lib/game-registry'

/**
 * #1101: POST /api/game/create hands the request's `config` to the registry, and
 * most entries spread it after their own limits, so a client could create a
 * three-seat Connect Four. Every game type is checked, so a new entry that
 * spreads in the wrong order cannot reopen it.
 */
describe('a request cannot change a game\'s seat limits (#1101)', () => {
  it.each(getSupportedGameTypes())('%s keeps its own maximum and minimum', (gameType) => {
    const { minPlayers, maxPlayers } = getGameMetadata(gameType)

    const tooMany = createGameEngine(gameType, 'limits-high', { maxPlayers: 99, minPlayers: 99 }).getConfig()
    expect(tooMany.maxPlayers).toBeLessThanOrEqual(maxPlayers)
    expect(tooMany.minPlayers).toBeLessThanOrEqual(tooMany.maxPlayers)

    const tooFew = createGameEngine(gameType, 'limits-low', { maxPlayers: 1, minPlayers: 0 }).getConfig()
    expect(tooFew.minPlayers).toBeGreaterThanOrEqual(minPlayers)
    expect(tooFew.maxPlayers).toBeGreaterThanOrEqual(minPlayers)
  })

  it('refuses a third seat in Connect Four', () => {
    const engine = createGameEngine('connect_four', 'c4', { maxPlayers: 3 })
    expect(engine.getConfig().maxPlayers).toBe(2)
  })

  it('leaves an in-range request alone', () => {
    expect(clampPlayerLimits({ minPlayers: 1, maxPlayers: 4 }, { maxPlayers: 3, minPlayers: 2 })).toEqual({
      maxPlayers: 3,
      minPlayers: 2,
    })
    expect(clampPlayerLimits({ minPlayers: 2, maxPlayers: 4 }, undefined)).toBeUndefined()
  })

  it('pins a lobby\'s seat count to the game', () => {
    // The lobby schema allows 2-16 and defaults to 6 for every game.
    expect(clampMaxPlayersForGame('tic_tac_toe', 6)).toBe(2)
    expect(clampMaxPlayersForGame('yahtzee', 16)).toBe(4)
    expect(clampMaxPlayersForGame('liars_party', 2)).toBe(4)
    expect(clampMaxPlayersForGame('memory', 3)).toBe(3)
  })
})
