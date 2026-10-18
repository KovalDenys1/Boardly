import { getCatalogGames, type GameCatalogEntry } from '@/lib/game-catalog'
import {
  DEFAULT_GAMES_FILTERS,
  PLAYER_COUNT_CAP,
  buildGamesQuery,
  difficultyOptions,
  filterGames,
  parseGamesFilters,
  parsePlayerRange,
  playerCountOptions,
  type GamesFilters,
} from '@/lib/games-filter'

const catalog = getCatalogGames()
const ids = (games: readonly GameCatalogEntry[]) => games.map((game) => game.id).sort()
const range = (game: GameCatalogEntry) => parsePlayerRange(game.players)!
const filters = (patch: Partial<GamesFilters>): GamesFilters => ({ ...DEFAULT_GAMES_FILTERS, ...patch })

describe('games filter (#1458)', () => {
  it('every catalog entry has a player range the filter can read', () => {
    for (const game of catalog) {
      expect({ id: game.id, range: parsePlayerRange(game.players) }).toEqual({
        id: game.id,
        range: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      })
    }
  })

  it('3 players hides games that cannot seat three', () => {
    const shown = filterGames(catalog, filters({ players: 3 }))
    const hidden = catalog.filter((game) => !shown.includes(game))

    expect(shown.length).toBeGreaterThan(0)
    expect(hidden.length).toBeGreaterThan(0)
    for (const game of shown) expect(range(game).min <= 3 && range(game).max >= 3).toBe(true)
    for (const game of hidden) expect(range(game).min <= 3 && range(game).max >= 3).toBe(false)
    expect(ids(hidden)).toEqual(expect.arrayContaining(['tic-tac-toe', 'connect-four', 'checkers', 'rps', 'liars-party']))
    expect(ids(shown)).toEqual(expect.arrayContaining(['yahtzee', 'spy', 'ludo']))
  })

  it('easy + 2 players shows only games matching both', () => {
    const shown = filterGames(catalog, filters({ players: 2, difficulty: 'easy' }))

    expect(shown.length).toBeGreaterThan(0)
    for (const game of shown) {
      expect(game.difficulty).toBe('easy')
      expect(range(game).min <= 2 && range(game).max >= 2).toBe(true)
    }
    const expected = catalog.filter(
      (game) => game.difficulty === 'easy' && range(game).min <= 2 && range(game).max >= 2,
    )
    expect(ids(shown)).toEqual(ids(expected))
    // Easy but not for two, and for two but not easy: both stay out.
    expect(ids(shown)).not.toContain('telephone-doodle')
    expect(ids(shown)).not.toContain('connect-four')
  })

  it(`${PLAYER_COUNT_CAP}+ shows the games that seat ${PLAYER_COUNT_CAP} or more`, () => {
    const shown = filterGames(catalog, filters({ players: PLAYER_COUNT_CAP }))
    expect(ids(shown)).toEqual(ids(catalog.filter((game) => range(game).max >= PLAYER_COUNT_CAP)))
    expect(ids(shown)).toContain('alias')
    expect(ids(shown)).not.toContain('yahtzee')
  })

  it('combines with the status chips', () => {
    const shown = filterGames(catalog, filters({ status: 'available', difficulty: 'hard' }))
    for (const game of shown) {
      expect(game.availability).toBe('available')
      expect(game.difficulty).toBe('hard')
    }
    expect(ids(shown)).not.toContain('alibi-night')
  })

  it('a combination nothing matches returns an empty list', () => {
    expect(filterGames(catalog, filters({ players: 1, difficulty: 'hard' }))).toEqual([])
  })

  it('builds the chip options from the catalog', () => {
    const games = [
      { players: '2-3', difficulty: 'easy' as const },
      { players: '6', difficulty: 'hard' as const },
    ]
    expect(playerCountOptions(games)).toEqual([2, 3, 6])
    expect(difficultyOptions(games)).toEqual(['easy', 'hard'])
    expect(playerCountOptions(catalog)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('reads a range written as a single number or with a plus', () => {
    expect(parsePlayerRange('2')).toEqual({ min: 2, max: 2 })
    expect(parsePlayerRange('3+')).toEqual({ min: 3, max: Infinity })
    expect(parsePlayerRange('many')).toBeNull()
    expect(parsePlayerRange('4-2')).toBeNull()
  })

  describe('URL query', () => {
    it('round-trips the filters and leaves defaults out of the URL', () => {
      const chosen = filters({ status: 'coming-soon', players: 4, difficulty: 'medium' })
      const query = buildGamesQuery('', chosen)
      expect(query).toBe('?status=coming-soon&players=4&difficulty=medium')
      expect(parseGamesFilters(new URLSearchParams(query))).toEqual(chosen)
      expect(buildGamesQuery('', DEFAULT_GAMES_FILTERS)).toBe('')
    })

    it('keeps unrelated params and drops a filter set back to its default', () => {
      expect(buildGamesQuery('?utm_source=x&players=3', filters({ difficulty: 'easy' }))).toBe(
        '?utm_source=x&difficulty=easy',
      )
    })

    it('ignores values it does not know and caps the player count', () => {
      expect(parseGamesFilters(new URLSearchParams('status=old&players=zero&difficulty=insane'))).toEqual(
        DEFAULT_GAMES_FILTERS,
      )
      expect(parseGamesFilters(new URLSearchParams('players=0')).players).toBeNull()
      expect(parseGamesFilters(new URLSearchParams('players=12')).players).toBe(PLAYER_COUNT_CAP)
      expect(parseGamesFilters(null)).toEqual(DEFAULT_GAMES_FILTERS)
    })
  })
})
