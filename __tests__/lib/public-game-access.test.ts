import {
  canCreateLobbyForGameType,
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
    expect(getGameLobbiesRoute('sketch_and_guess')).toBe('/games/sketch-and-guess/lobbies')
  })

  it('builds game-specific lobby creation routes', () => {
    expect(getLobbyCreateRoute('yahtzee')).toBe('/lobby/create?gameType=yahtzee')
    expect(getLobbyCreateRoute('guess_the_spy')).toBe('/lobby/create?gameType=guess_the_spy')
    expect(getLobbyCreateRoute(null)).toBeNull()
  })

  it('marks coming-soon games as temporarily unavailable', () => {
    // Liar's Party is still in-development (#872); RPS went public in #870
    expect(isTemporarilyUnavailableGameType('rock_paper_scissors')).toBe(false)
    expect(isTemporarilyUnavailableGameType('liars_party')).toBe(true)
    expect(isTemporarilyUnavailableGameType('alias')).toBe(false)
    expect(isTemporarilyUnavailableGameType('yahtzee')).toBe(false)
    expect(isTemporarilyUnavailableGameType(undefined)).toBe(false)
    // Sketch & Guess has a live lobbies route but is gated behind
    // ENABLE_SKETCH_AND_GUESS, which is off here — without it in the route map
    // the page would offer a create button that lands on the default game (#871)
    expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(true)
  })

  describe('canCreateLobbyForGameType', () => {
    it('covers every game a lobby invite can land on', () => {
      // The four games the result overlay shares an invite from (#927), plus the rest
      // of the catalog a shared lobby link can point at.
      expect(canCreateLobbyForGameType('memory')).toBe(true)
      expect(canCreateLobbyForGameType('tic_tac_toe')).toBe(true)
      expect(canCreateLobbyForGameType('connect_four')).toBe(true)
      expect(canCreateLobbyForGameType('rock_paper_scissors')).toBe(true)
      expect(canCreateLobbyForGameType('yahtzee')).toBe(true)
      expect(canCreateLobbyForGameType('guess_the_spy')).toBe(true)
      expect(canCreateLobbyForGameType('alias')).toBe(true)
    })

    it('refuses a game the create page has no form for', () => {
      // In-development, so the page refuses it too.
      expect(canCreateLobbyForGameType('liars_party')).toBe(false)
      // Not in the catalog at all, and a GameType the database accepts.
      expect(canCreateLobbyForGameType('other')).toBe(false)
      expect(canCreateLobbyForGameType(null)).toBe(false)
      expect(canCreateLobbyForGameType(undefined)).toBe(false)
      expect(canCreateLobbyForGameType('')).toBe(false)
    })

    it('refuses an experimental game that is enabled but has no lobbyCreateConfig', () => {
      // These two are the reason the check is not isTemporarilyUnavailableGameType:
      // it says false for both, and /lobby/create would answer with Yahtzee's form.
      expect(isTemporarilyUnavailableGameType('fake_artist')).toBe(false)
      expect(canCreateLobbyForGameType('fake_artist')).toBe(false)
      expect(isTemporarilyUnavailableGameType('telephone_doodle')).toBe(false)
      expect(canCreateLobbyForGameType('telephone_doodle')).toBe(false)
    })

    it('opens the create form for Sketch & Guess now that it has a config (#1035)', () => {
      // It used to be the third game in the test above: promoted by its flag and
      // still handed Yahtzee's form. The config added in #1035 is what closes
      // that, and the flag is the only thing standing between here and #873.
      const previous = process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS
      process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS = 'true'
      try {
        expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)
        expect(canCreateLobbyForGameType('sketch_and_guess')).toBe(true)
      } finally {
        if (previous === undefined) {
          delete process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS
        } else {
          process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS = previous
        }
      }

      // With the flag off the catalog entry is in-development, so the page must
      // still refuse it: #1035 prepared the form, it did not publish the game.
      expect(canCreateLobbyForGameType('sketch_and_guess')).toBe(false)
      expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(true)
    })
  })

  it('getPublicRegisteredGameTypes returns currently available games', () => {
    const publicTypes = getPublicRegisteredGameTypes()
    expect(publicTypes).toContain('yahtzee')
    expect(publicTypes).toContain('guess_the_spy')
    expect(publicTypes).toContain('tic_tac_toe')
    expect(publicTypes).toContain('memory')
    expect(publicTypes).toContain('alias')
    // LP excluded while in-development; RPS is public (#870)
    expect(publicTypes).toContain('rock_paper_scissors')
    expect(publicTypes).not.toContain('liars_party')
  })
})
