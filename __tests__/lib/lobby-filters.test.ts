import {
  buildLobbyQueryParams,
  hasActiveLobbyFilters,
  LOBBY_CODE_LENGTH,
  normalizeGameTypeFilter,
  parseFiltersFromSearchParams,
  sanitizeLobbyCode,
} from '@/lib/lobby-filters'

describe('lobby-filters helpers', () => {
  it('normalizes allowed game type filters', () => {
    expect(normalizeGameTypeFilter('yahtzee')).toBe('yahtzee')
    expect(normalizeGameTypeFilter('guess_the_spy')).toBe('guess_the_spy')
    expect(normalizeGameTypeFilter('memory')).toBe('memory')
    expect(normalizeGameTypeFilter('unknown')).toBeUndefined()
    expect(normalizeGameTypeFilter(null)).toBeUndefined()
  })

  it('sanitizes lobby code to uppercase alphanumeric and fixed length', () => {
    expect(sanitizeLobbyCode('ab12')).toBe('AB12')
    expect(sanitizeLobbyCode('a-b 12__zz')).toBe('AB12')
    expect(sanitizeLobbyCode('longcode123')).toHaveLength(LOBBY_CODE_LENGTH)
  })

  it('builds query params from provided filters only', () => {
    const params = buildLobbyQueryParams({
      gameType: 'yahtzee',
      status: 'waiting',
      search: 'fun',
      minPlayers: 2,
      maxPlayers: 5,
      sortBy: 'playerCount',
      sortOrder: 'asc',
    })

    expect(params.toString()).toBe(
      'gameType=yahtzee&status=waiting&search=fun&minPlayers=2&maxPlayers=5&sortBy=playerCount&sortOrder=asc'
    )
  })

  it('does not include status=all in query params', () => {
    const params = buildLobbyQueryParams({
      status: 'all',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })

    expect(params.toString()).toBe('sortBy=createdAt&sortOrder=desc')
  })

  it('parses all filter params from URLSearchParams', () => {
    const params = new URLSearchParams(
      'gameType=yahtzee&status=waiting&search=fun&sortBy=playerCount&sortOrder=asc&minPlayers=2&maxPlayers=5'
    )
    const filters = parseFiltersFromSearchParams(params)
    expect(filters).toEqual({
      gameType: 'yahtzee',
      status: 'waiting',
      search: 'fun',
      sortBy: 'playerCount',
      sortOrder: 'asc',
      minPlayers: 2,
      maxPlayers: 5,
    })
  })

  it('parseFiltersFromSearchParams falls back to defaults for invalid values', () => {
    const params = new URLSearchParams('gameType=unknown&status=invalid&sortBy=bogus&sortOrder=weird')
    const filters = parseFiltersFromSearchParams(params)
    expect(filters.gameType).toBeUndefined()
    expect(filters.status).toBe('all')
    expect(filters.sortBy).toBe('createdAt')
    expect(filters.sortOrder).toBe('desc')
  })

  it('detects active filters', () => {
    expect(
      hasActiveLobbyFilters({
        status: 'all',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
    ).toBe(false)

    expect(
      hasActiveLobbyFilters({
        status: 'waiting',
      })
    ).toBe(true)

    expect(
      hasActiveLobbyFilters({
        search: 'abc',
      })
    ).toBe(true)
  })
})
