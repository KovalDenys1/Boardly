import { existsSync } from 'fs'
import path from 'path'

import {
  getAvailableGameTypes,
  getBotSupportedGameTypes,
  getCatalogAvailableGames,
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
    // RPS is public again (#870); Liar's Party stays in-development until #872
    expect(available).toContain('rock_paper_scissors')
    expect(available).not.toContain('liars_party')
    expect(isAvailableGameType('yahtzee')).toBe(true)
    expect(isAvailableGameType('rock_paper_scissors')).toBe(true)
    expect(isAvailableGameType('liars_party')).toBe(false)
    expect(isAvailableGameType('sketch_and_guess')).toBe(false)
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
    const availableGames = getCatalogAvailableGames({ enabledExperimental: ['guess-my-drawing'] })

    expect(availableGames.map((game) => game.gameType)).toContain('sketch_and_guess')
    expect(getAvailableGameTypes({ enabledExperimental: ['guess-my-drawing'] })).toContain('sketch_and_guess')
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
