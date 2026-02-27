import {
  buildLobbyQueryParams,
  hasActiveLobbyFilters,
  LOBBY_CODE_LENGTH,
  normalizeGameTypeFilter,
  sanitizeLobbyCode,
} from '@/lib/lobby-filters'

describe('lobby-filters helpers', () => {
  it('normalizes allowed game type filters', () => {
    expect(normalizeGameTypeFilter('yahtzee')).toBe('yahtzee')
    expect(normalizeGameTypeFilter('guess_the_spy')).toBe('guess_the_spy')
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
