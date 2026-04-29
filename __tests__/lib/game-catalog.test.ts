import {
  getAvailableGameTypes,
  getCatalogAvailableGames,
  getCatalogGames,
  isAvailableGameType,
} from '@/lib/game-catalog'

const FEATURE_ENV_KEYS = [
  'ENABLE_TELEPHONE_DOODLE',
  'NEXT_PUBLIC_ENABLE_TELEPHONE_DOODLE',
  'ENABLE_SKETCH_AND_GUESS',
  'NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS',
  'ENABLE_LIARS_PARTY',
  'NEXT_PUBLIC_ENABLE_LIARS_PARTY',
  'ENABLE_FAKE_ARTIST',
  'NEXT_PUBLIC_ENABLE_FAKE_ARTIST',
  'ENABLE_ALIAS',
  'NEXT_PUBLIC_ENABLE_ALIAS',
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
    ])
    expect(isAvailableGameType('yahtzee')).toBe(true)
    expect(isAvailableGameType('rock_paper_scissors')).toBe(false)
  })

  it('can promote experimental catalog entries through the shared availability path', () => {
    const availableGames = getCatalogAvailableGames({ enabledExperimental: ['alias'] })

    expect(availableGames.map((game) => game.gameType)).toContain('alias')
    expect(getAvailableGameTypes({ enabledExperimental: ['alias'] })).toContain('alias')
  })
})
