import { existsSync } from 'fs'
import path from 'path'

import {
  getAllEnabledGameTypes,
  getAllRegisteredGameTypes,
  getAvailableGameTypes,
  getBotSupportedGameTypes,
  getCatalogAvailableGames,
  getCatalogEntryById,
  getCatalogGames,
  getGameMetadata,
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
    const available = getAvailableGameTypes()
    expect(available).toContain('yahtzee')
    expect(available).toContain('guess_the_spy')
    expect(available).toContain('tic_tac_toe')
    expect(available).toContain('memory')
    expect(available).toContain('connect_four')
    expect(available).toContain('alias')
    // RPS is public again (#870); Liar's Party and Sketch & Guess were released by #873
    expect(available).toContain('rock_paper_scissors')
    expect(available).toContain('liars_party')
    expect(available).toContain('sketch_and_guess')
    // The in-development entries are what this list has to keep out. Both flags are
    // deleted in beforeEach, so these two are unpromoted here.
    expect(available).not.toContain('fake_artist')
    expect(available).not.toContain('telephone_doodle')
    expect(isAvailableGameType('yahtzee')).toBe(true)
    expect(isAvailableGameType('rock_paper_scissors')).toBe(true)
    expect(isAvailableGameType('liars_party')).toBe(true)
    expect(isAvailableGameType('sketch_and_guess')).toBe(true)
    expect(isAvailableGameType('fake_artist')).toBe(false)
    expect(isAvailableGameType('telephone_doodle')).toBe(false)
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

  it('every catalog route points at a page that exists (#975)', () => {
    // fake-artist and telephone-doodle carried routes under app/games/ that were
    // never built, so flipping either flag promoted the entry and put a link to a
    // 404 on /games and the home ribbon. A route is a promise that a page is there.
    const routed = getCatalogGames().filter((game) => game.route !== undefined)

    expect(routed.length).toBeGreaterThan(0)
    for (const game of routed) {
      const page = path.join(process.cwd(), 'app', `${game.route}/page.tsx`)
      expect({ id: game.id, hasPage: existsSync(page) }).toEqual({ id: game.id, hasPage: true })
    }
  })

  it('does not route the games that have no page yet (#975)', () => {
    const promoted = getCatalogGames({
      enabledExperimental: ['fake-artist', 'telephone-doodle'],
    }).filter((game) => game.id === 'fake-artist' || game.id === 'telephone-doodle')

    expect(promoted).toHaveLength(2)
    for (const game of promoted) {
      expect({ id: game.id, availability: game.availability }).toEqual({
        id: game.id,
        availability: 'available',
      })
      expect({ id: game.id, route: game.route }).toEqual({ id: game.id, route: undefined })
    }
  })

  it('can promote experimental catalog entries through the shared availability path', () => {
    // Pointed at fake-artist since #873: guess-my-drawing is `available` in the static
    // catalog now, so promoting it proves nothing – the assertion would hold with the
    // promotion path deleted. fake-artist is in-development, so it still has to travel
    // that path to reach either list.
    expect(getCatalogAvailableGames().map((game) => game.gameType)).not.toContain('fake_artist')

    const availableGames = getCatalogAvailableGames({ enabledExperimental: ['fake-artist'] })

    expect(availableGames.map((game) => game.gameType)).toContain('fake_artist')
    expect(getAvailableGameTypes({ enabledExperimental: ['fake-artist'] })).toContain('fake_artist')
  })
})

describe('Sketch & Guess release (#1035 prepared it, #873 shipped it)', () => {
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

  it('is available: #1035 removed the blockers, #873 took the decision', () => {
    // The one assertion in this file that is about a product decision rather
    // than about code. It said `in-development` until #873, which is Denys's
    // call of 2026-09-20 and the reason this line changed at all.
    const entry = getCatalogEntryById('guess-my-drawing')!

    expect(entry.availability).toBe('available')
    // beforeEach deletes both ENABLE_SKETCH_AND_GUESS variables, so what puts the
    // game in these lists is the static entry: the release lives in the catalog
    // now, not in an environment variable.
    expect(getAvailableGameTypes()).toContain('sketch_and_guess')
    expect(isAvailableGameType('sketch_and_guess')).toBe(true)
  })

  it('has everything an availability flip needs', () => {
    const entry = getCatalogEntryById('guess-my-drawing')!

    expect(entry.gameType).toBe('sketch_and_guess')
    expect(entry.route).toBe('/games/sketch-and-guess/lobbies')
    expect(entry.seo).toBeDefined()
    expect(entry.lobbyCreateConfig).toBeDefined()
    // isAvailableCatalogEntry demands the config, so the flip alone would not
    // have been enough before this: promoted and still not "available". Read
    // off the plain catalog since #873 – the entry has to clear that guard with
    // no promotion propping it up.
    expect(
      getCatalogGames()
        .filter(isAvailableCatalogEntry)
        .map((game) => game.id)
    ).toContain('guess-my-drawing')
  })

  it('offers exactly the seats the engine accepts, and no dead controls', () => {
    // Literals, not a range read back from the engine: SketchAndGuessGame's
    // default config is minPlayers 3 / maxPlayers 10, and a form offering 2 or
    // 12 would build a lobby the game refuses to start.
    const config = getCatalogEntryById('guess-my-drawing')!.lobbyCreateConfig!

    expect(config.allowedPlayers).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
    expect(config.defaultMaxPlayers).toBe(6)
    expect(config.allowedPlayers).toContain(config.defaultMaxPlayers)
    // The game runs on SKETCH_PHASE_SECONDS and ignores the lobby turn timer,
    // and the create form's round picker only ever reaches tic-tac-toe. Either
    // key here would render a control that changes nothing about the game.
    expect(config.turnTimer).toBeUndefined()
    expect(config.rounds).toBeUndefined()
  })

  it('is engine metadata with the flag off, so the detail page can prerender', () => {
    // lib/game-seo.ts resolves every page through getGameMetadata. While this
    // returned null without ENABLE_SKETCH_AND_GUESS, building /games/sketch-and-guess
    // threw "No engine metadata for game type".
    const meta = getGameMetadata('sketch_and_guess')

    expect(meta).not.toBeNull()
    expect(meta!.minPlayers).toBe(3)
    expect(meta!.maxPlayers).toBe(10)
    expect(meta!.supportsBots).toBe(false)
    expect(getAllRegisteredGameTypes()).toContain('sketch_and_guess')
    // Registered games are listed once; the experimental push used to add it.
    expect(getAllEnabledGameTypes().filter((type) => type === 'sketch_and_guess')).toHaveLength(1)
  })
})

describe('leave-behavior metadata (#759)', () => {
  const { getGameMetadata } = require('@/lib/game-catalog')

  it('spy abandons when its critical role leaves', () => {
    expect(getGameMetadata('guess_the_spy')?.abandonWhenRoleLeaves).toEqual({
      stateDataKey: 'spyPlayerId',
      reason: 'spy_left',
    })
  })

  it('turn-advancing games declare their turn-reset fields', () => {
    expect(getGameMetadata('yahtzee')?.turnResetOnLeave).toMatchObject({
      rollsLeft: 3,
      held: [false, false, false, false, false],
    })
    expect(getGameMetadata('memory')?.turnResetOnLeave).toMatchObject({
      flippedCardIds: [],
      pendingMismatchCardIds: [],
      advanceTurnAfterMove: false,
    })
  })

  it('every advanceTurnOnLeave game has turnResetOnLeave defined', () => {
    for (const type of ['yahtzee', 'guess_the_spy', 'tic_tac_toe', 'rock_paper_scissors', 'memory', 'connect_four', 'alias', 'liars_party'] as const) {
      const meta = getGameMetadata(type)
      if (meta?.advanceTurnOnLeave) {
        expect(meta.turnResetOnLeave).toBeDefined()
      }
    }
  })

  it('yahtzee lobbyCreateConfig defaults to short mode (#779, #812)', () => {
    // Classic runs 15 rounds and no game has ever been finished from the
    // mid-game, so short is the default and classic an explicit opt-in.
    const yahtzee = getCatalogGames().find((g) => g.gameType === 'yahtzee')
    expect(yahtzee?.lobbyCreateConfig?.gameModes).toEqual({
      options: ['short', 'classic'],
      default: 'short',
    })
  })

})

describe('advertised player counts (#969)', () => {
  it('matches every catalog entry to its engine metadata', () => {
    // #847 dropped Alias to three players but the catalog still said 4-16, so
    // /games/alias turned a group of three away from a game they can play.
    // A bot game may advertise 1 because the empty seats are filled by bots.
    for (const game of getCatalogGames()) {
      const metadata = game.gameType ? getGameMetadata(game.gameType) : null
      if (!metadata) continue
      const [min, max] = game.players.split('-').map(Number)
      expect({ type: game.gameType, max }).toEqual({ type: game.gameType, max: metadata.maxPlayers })
      expect({ type: game.gameType, min }).toEqual({
        type: game.gameType,
        min: metadata.supportsBots ? 1 : metadata.minPlayers,
      })
    }
  })
})
