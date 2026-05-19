import {
  getGameLobbiesRoute,
  getLobbyCreateRoute,
  isTemporarilyUnavailableGameType,
  getPublicRegisteredGameTypes,
} from '@/lib/public-game-access'

describe('public game access helpers', () => {
  it('maps supported lobby routes to the correct slug pages', () => {
    expect(getGameLobbiesRoute('yahtzee')).toBe('/games/yahtzee/lobbies')
    expect(getGameLobbiesRoute('guess_the_spy')).toBe('/games/spy/lobbies')
    expect(getGameLobbiesRoute('tic_tac_toe')).toBe('/games/tic-tac-toe/lobbies')
    expect(getGameLobbiesRoute('memory')).toBe('/games/memory/lobbies')
    expect(getGameLobbiesRoute('liars_party')).toBe('/games/liars-party/lobbies')
  })

  it('builds game-specific lobby creation routes', () => {
    expect(getLobbyCreateRoute('yahtzee')).toBe('/lobby/create?gameType=yahtzee')
    expect(getLobbyCreateRoute('guess_the_spy')).toBe('/lobby/create?gameType=guess_the_spy')
    expect(getLobbyCreateRoute(null)).toBeNull()
  })

  it('marks coming-soon games as temporarily unavailable', () => {
    // RPS and Liar's Party are temporarily in-development
    expect(isTemporarilyUnavailableGameType('rock_paper_scissors')).toBe(true)
    expect(isTemporarilyUnavailableGameType('liars_party')).toBe(true)
    expect(isTemporarilyUnavailableGameType('alias')).toBe(false)
    expect(isTemporarilyUnavailableGameType('yahtzee')).toBe(false)
    expect(isTemporarilyUnavailableGameType(undefined)).toBe(false)
  })

  it('getPublicRegisteredGameTypes returns currently available games', () => {
    const publicTypes = getPublicRegisteredGameTypes()
    expect(publicTypes).toContain('yahtzee')
    expect(publicTypes).toContain('guess_the_spy')
    expect(publicTypes).toContain('tic_tac_toe')
    expect(publicTypes).toContain('memory')
    expect(publicTypes).toContain('alias')
    // RPS and LP excluded while in-development
    expect(publicTypes).not.toContain('rock_paper_scissors')
    expect(publicTypes).not.toContain('liars_party')
  })
})
