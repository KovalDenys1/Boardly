import {
  getAvailableGameTypes,
  getBotSupportedGameTypes,
  getCatalogAvailableGames,
  getCatalogGames,
  hasBotSupport,
  isAvailableGameType,
  isAvailableCatalogEntry,
} from '@/lib/game-catalog'

const FEATURE_ENV_KEYS = [
  'ENABLE_TELEPHONE_DOODLE',
  'NEXT_PUBLIC_ENABLE_TELEPHONE_DOODLE',
  'ENABLE_SKETCH_AND_GUESS',
  'NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS',
  'ENABLE_FAKE_ARTIST',
  'NEXT_PUBLIC_ENABLE_FAKE_ARTIST',
] as const

describe('game catalog availability', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    for (const key of FEATURE_ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('exposes one catalog with available, in-development, and planned games', () => {
    const availability = new Set(getCatalogGames().map((game) => game.availability))

    expect(availability).toEqual(new Set(['available', 'in-development', 'planned']))
  })

  it('returns only available game types for filters and public entry points', () => {
    expect(getAvailableGameTypes()).toEqual([
      'yahtzee',
      'guess_the_spy',
      'tic_tac_toe',
      'memory',
      'connect_four',
      'alias',
    ])
    expect(isAvailableGameType('yahtzee')).toBe(true)
    expect(isAvailableGameType('rock_paper_scissors')).toBe(false)
  })

  it('exposes memory as a bot-supported game type', () => {
    expect(hasBotSupport('memory')).toBe(true)
    expect(getBotSupportedGameTypes()).toContain('memory')
  })

  it('every available game has gameType, route, and lobbyCreateConfig', () => {
    const available = getCatalogGames().filter(isAvailableCatalogEntry)

    expect(available.length).toBeGreaterThan(0)
    for (const game of available) {
      expect(game.gameType).toBeDefined()
      expect(game.route).toBeDefined()
      expect(game.lobbyCreateConfig).toBeDefined()
      expect(game.lobbyCreateConfig.allowedPlayers.length).toBeGreaterThan(0)
    }
  })

  it('can promote experimental catalog entries through the shared availability path', () => {
    const availableGames = getCatalogAvailableGames({ enabledExperimental: ['guess-my-drawing'] })

    expect(availableGames.map((game) => game.gameType)).toContain('sketch_and_guess')
    expect(getAvailableGameTypes({ enabledExperimental: ['guess-my-drawing'] })).toContain('sketch_and_guess')
  })
})
