import { getCatalogGames, isRegisteredGameType } from '@/lib/game-catalog'
import {
  canCreateLobbyForGameType,
  getGameLobbiesRoute,
  getLobbyCreateRoute,
  isTemporarilyUnavailableGameType,
  getPublicRegisteredGameTypes,
} from '@/lib/public-game-access'
import {
  HELD_BACK_GAME_TYPE,
  HELD_BACK_LOBBIES_ROUTE,
  heldBackCatalog,
} from '../fixtures/held-back-catalog'

const IN_DEVELOPMENT_FLAG_KEYS = [
  'ENABLE_IN_DEVELOPMENT_GAMES',
  'NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES',
] as const

/**
 * CLAUDE.md tells a developer to put both of these in `.env.local` to play an unreleased
 * game, and next/jest loads that file, so anything asserting that a game is held back has
 * to say which environment it is asking about instead of inheriting one.
 */
function withoutInDevelopmentFlag(run: () => void): void {
  const previous = IN_DEVELOPMENT_FLAG_KEYS.map((key) => [key, process.env[key]] as const)

  for (const [key] of previous) {
    delete process.env[key]
  }
  try {
    run()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

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
    // available. #873 released the last two routed entries that were not, so every
    // entry this loop reaches in the shipped catalog is on the `false` side of it.
    for (const game of getCatalogGames()) {
      if (!game.gameType || getGameLobbiesRoute(game.gameType) === null) continue
      expect({ id: game.id, held: isTemporarilyUnavailableGameType(game.gameType) }).toEqual({
        id: game.id,
        held: game.availability !== 'available',
      })
    }
  })

  it('holds back a routed game while the catalog has not released it', () => {
    // The same rule, and the half the shipped catalog can no longer demonstrate. Run over
    // a catalog where one routed, registered entry is still in-development, the loop above
    // has a `true` side again - and `held` is counted, because a loop that agrees with an
    // empty set is what this file was doing before.
    withoutInDevelopmentFlag(() => {
      const catalog = heldBackCatalog(getCatalogGames())
      let held = 0

      for (const game of getCatalogGames({ catalog })) {
        if (!game.gameType || getGameLobbiesRoute(game.gameType) === null) continue
        const isHeld = isTemporarilyUnavailableGameType(game.gameType, { catalog })
        if (isHeld) held += 1
        expect({ id: game.id, held: isHeld }).toEqual({
          id: game.id,
          held: game.availability !== 'available',
        })
      }

      expect(held).toBe(1)
      // A route is where the game would live, not permission to go there: the entry is in
      // the route map throughout, and it is the catalog that keeps it shut.
      expect(getGameLobbiesRoute(HELD_BACK_GAME_TYPE)).toBe(HELD_BACK_LOBBIES_ROUTE)
      expect(isTemporarilyUnavailableGameType(HELD_BACK_GAME_TYPE, { catalog })).toBe(true)
    })
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

  it('getPublicRegisteredGameTypes leaves out a registered game the catalog has not released', () => {
    // Today every key of GAME_LOBBIES_ROUTES is an available game, so the whole route map
    // and the answer are the same list and the test above holds whether this function reads
    // availability or the map. They are not the same question: the map says a page exists,
    // availability says the game is public. Every game shipped so far spent time as one and
    // not the other, and the list feeds the sitemap and the lobby pickers.
    withoutInDevelopmentFlag(() => {
      const catalog = heldBackCatalog(getCatalogGames())
      const publicTypes = getPublicRegisteredGameTypes({ catalog })

      expect(getGameLobbiesRoute(HELD_BACK_GAME_TYPE)).toBe(HELD_BACK_LOBBIES_ROUTE)
      expect(publicTypes).not.toContain(HELD_BACK_GAME_TYPE)
      // The rest of the catalog is unaffected, so the absence above is the filter working
      // and not an empty list.
      expect(publicTypes).toContain('yahtzee')
      expect(publicTypes).toContain('sketch_and_guess')
      expect(publicTypes.length).toBe(getPublicRegisteredGameTypes().length - 1)
    })
  })
})
