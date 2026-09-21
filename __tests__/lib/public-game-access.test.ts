import { getCatalogGames, isRegisteredGameType } from '@/lib/game-catalog'
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

  it('marks exactly the routed games the catalog has not released', () => {
    // RPS went public in #870, Liar's Party and Sketch & Guess in #873.
    expect(isTemporarilyUnavailableGameType('rock_paper_scissors')).toBe(false)
    expect(isTemporarilyUnavailableGameType('liars_party')).toBe(false)
    expect(isTemporarilyUnavailableGameType('alias')).toBe(false)
    expect(isTemporarilyUnavailableGameType('yahtzee')).toBe(false)
    expect(isTemporarilyUnavailableGameType(undefined)).toBe(false)
    // Sketch & Guess used to be the interesting row here: a live lobbies route
    // behind ENABLE_SKETCH_AND_GUESS, which without an entry in the route map
    // offered a create button that landed on the default game (#871).
    expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)

    // The rule those rows are examples of, derived so it cannot go stale: a game
    // with a lobbies route is held back exactly while the catalog says it is not
    // available. #873 released the last two routed entries that were not, so the
    // `true` side has no subject in today's catalog - it is proven at the route,
    // against a stand-in entry, in __tests__/api/in-development-game-gate.test.ts.
    // The day an in-development entry gets a route, this loop demands the 400.
    for (const game of getCatalogGames()) {
      if (!game.gameType || getGameLobbiesRoute(game.gameType) === null) continue
      expect({ id: game.id, held: isTemporarilyUnavailableGameType(game.gameType) }).toEqual({
        id: game.id,
        held: game.availability !== 'available',
      })
    }
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
      // Released by #873, so a shared link can now land on either of them too.
      expect(canCreateLobbyForGameType('liars_party')).toBe(true)
      expect(canCreateLobbyForGameType('sketch_and_guess')).toBe(true)
    })

    it('refuses a game the create page has no form for', () => {
      // In-development, so the page refuses it too. This was Liar's Party until
      // #873 released it; Telephone Doodle is the in-development entry now.
      expect(canCreateLobbyForGameType('telephone_doodle')).toBe(false)
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

    it('opens the create form for Sketch & Guess, with or without its flag (#1035, #873)', () => {
      // It used to be the third game in the test above: promoted by its flag and
      // still handed Yahtzee's form. The config added in #1035 is what closed that.
      const previous = process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS
      try {
        // This half used to assert the opposite, and it was the point of the test:
        // with the flag off the entry was in-development and the page had to refuse
        // it, because #1035 prepared the form without publishing the game. #873
        // published it, so the answer now comes from the static catalog entry and
        // the flag decides nothing. The refusal itself is still covered above, by
        // the two entries that are in-development today.
        delete process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS
        expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)
        expect(canCreateLobbyForGameType('sketch_and_guess')).toBe(true)

        process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS = 'true'
        expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)
        expect(canCreateLobbyForGameType('sketch_and_guess')).toBe(true)
      } finally {
        if (previous === undefined) {
          delete process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS
        } else {
          process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS = previous
        }
      }
    })
  })

  it('getPublicRegisteredGameTypes returns currently available games', () => {
    const publicTypes = getPublicRegisteredGameTypes()
    expect(publicTypes).toContain('yahtzee')
    expect(publicTypes).toContain('guess_the_spy')
    expect(publicTypes).toContain('tic_tac_toe')
    expect(publicTypes).toContain('memory')
    expect(publicTypes).toContain('alias')
    // RPS is public since #870, Liar's Party and Sketch & Guess since #873
    expect(publicTypes).toContain('rock_paper_scissors')
    expect(publicTypes).toContain('liars_party')
    expect(publicTypes).toContain('sketch_and_guess')
    // The exclusion this used to make with Liar's Party, derived instead of named:
    // the list is the registered games the catalog calls available, and nothing
    // else. An entry added in-development is kept out by this line on its first day.
    expect([...publicTypes].sort()).toEqual(
      getCatalogGames()
        .filter(
          (game) =>
            game.availability === 'available' &&
            game.gameType !== undefined &&
            isRegisteredGameType(game.gameType)
        )
        .map((game) => game.gameType)
        .sort()
    )
  })
})
