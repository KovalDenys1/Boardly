/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are intentionally loose, and NODE_ENV is readonly to TS

/**
 * #1054 - the production half of "let an in-development game be played".
 *
 * ENABLE_IN_DEVELOPMENT_GAMES promotes every built-but-unfeatured catalog entry to
 * `available`, which is what makes POST /api/lobby stop answering 400 and a real game
 * reachable on a laptop or a preview deployment. The rule that must not bend is that a
 * visitor on boardly.online sees exactly what they saw before, so the flag is tested
 * against the deployments it must be dead in, with both variables set as loudly as an
 * accident could set them.
 *
 * The suite drives the real POST handler rather than the helper it calls: the helper
 * returning true is not the promise made to Denys, the route answering 400 is.
 *
 * Since #873 the catalog has no in-development game the route can refuse, so the entry
 * the handler is driven with is simulated - see the `@/lib/game-catalog` mock below for
 * what that does and does not stand in for.
 */

import { NextRequest } from 'next/server'
import { POST as CREATE_LOBBY } from '@/app/api/lobby/route'
import { isInDevelopmentGamePlayEnabled } from '@/lib/feature-flags'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { heldBackCatalog } from '../fixtures/held-back-catalog'

/**
 * The stand-in for the catalog state #873 took away, and the only thing in this file
 * that is simulated.
 *
 * Until #873 the suite drove the route with `liars_party`: a real entry that was
 * `in-development` and carried a lobbies route, so the guard had a game to refuse.
 * That release made it and `sketch_and_guess` available, and the two entries still
 * `in-development` - fake_artist and telephone_doodle - have no route (#975), so they
 * are not in GAME_LOBBIES_ROUTES, `isTemporarilyUnavailableGameType` has never heard
 * of them, and POST /api/lobby would answer 200 for them whatever the flag says. With
 * the real catalog alone the production rule is no longer provable at the route: not
 * because it stopped holding, but because there is nothing left to hold it against.
 *
 * So the catalog is the stand-in, and nothing else is. `heldBackCatalog` winds one
 * entry's availability back to where it was on 2026-09-19 and hands the result to the
 * real `getAvailableGameTypes`, so every step of the answer is still the product's:
 * the real `isInDevelopmentGamePlayEnabled()`, the real `isFlagPromotableEntry`, the
 * real filter in `getCatalogGames`. The first version of this mock computed promotion
 * itself, which is why deleting the promotion branch from `getCatalogGames` left this
 * file 24/24 green - a mock that answers the question under test cannot fail with the
 * product. Everything downstream is untouched: the route, its handler,
 * `isTemporarilyUnavailableGameType`, the route map. Delete the guard from the route,
 * the production check inside the flag, or the promotion branch itself, and these cases
 * go red - checked by doing all three on 2026-09-21.
 *
 * Where a test is about the real catalog rather than about the gate it says so by
 * reading through `jest.requireActual`.
 */
jest.mock('@/lib/game-catalog', () => {
  const actual = jest.requireActual('@/lib/game-catalog')
  const { heldBackCatalog } = jest.requireActual('../fixtures/held-back-catalog')

  return {
    ...actual,
    getAvailableGameTypes: (options?: { enabledExperimental?: readonly string[] }) =>
      actual.getAvailableGameTypes({
        ...options,
        catalog: heldBackCatalog(actual.getCatalogGames()),
      }),
  }
})

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    lobbies: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    games: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    players: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    lobbyInvites: {
      updateMany: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/lobby', () => ({
  generateLobbyCode: jest.fn(() => 'DEV123'),
  isLobbyCodeConflict: jest.fn(() => false),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    api: {},
    game: {},
    lobbyCreation: {},
    lobbyCreationPremium: {},
  },
}))

// Not the module under test: the point of the suite is which game types reach the engine,
// not what the engine then does with them.
jest.mock('@/lib/game-registry', () => ({
  DEFAULT_GAME_TYPE: 'yahtzee',
  hasBotSupport: jest.fn(() => false),
  isSupportedGameType: jest.fn(() => true),
  createGameEngine: jest.fn(() => ({
    getState: () => ({ players: [], currentPlayerIndex: 0, status: 'waiting', data: {} }),
  })),
}))

jest.mock('@/lib/lobby-snapshot', () => ({
  pickRelevantLobbyGame: jest.fn((games: any[]) => games[0] || null),
}))

jest.mock('@/lib/csrf', () => ({
  verifyCsrfToken: jest.fn(() => true),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>

/**
 * Ids are shaped the way Postgres holds them: `Users.id` and `Players.id` are cuids, and a
 * lobby code is six upper-case characters. A uuid fixture would pass here and tell us
 * nothing about the rows this route actually writes.
 */
const HOST = {
  id: 'clw4k2n9x0000qf3h8b7dv1ab',
  username: 'Host',
  isGuest: true,
}

const CREATED_LOBBY = {
  id: 'clw4k2n9x0001qf3h9c8ew2cd',
  code: 'DEV123',
  name: "Liar's Party",
  games: [
    {
      id: 'clw4k2n9x0002qf3hab9fx3ef',
      status: 'waiting',
      players: [{ userId: HOST.id, position: 0 }],
    },
  ],
}

const ENV_KEYS = [
  'ENABLE_IN_DEVELOPMENT_GAMES',
  'NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES',
  'VERCEL_ENV',
  'NEXT_PUBLIC_VERCEL_ENV',
  'NODE_ENV',
] as const

function applyEnv(values: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = values[key]
    }
  }
}

/** Both variables on, because an accident sets whichever one it copied. */
const FLAG_ON = {
  ENABLE_IN_DEVELOPMENT_GAMES: 'true',
  NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES: 'true',
}

/**
 * Every environment the flag has to stay dead in. The first row is boardly.online itself;
 * the rest are the ways a deployment could look like something else and must not be
 * given the benefit of the doubt.
 */
const PRODUCTION_ENVIRONMENTS: Array<{ label: string; env: Record<string, string | undefined> }> = [
  {
    label: 'boardly.online, the production deployment',
    env: { ...FLAG_ON, VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'production', NODE_ENV: 'production' },
  },
  {
    label: 'a production server whose inlined client copy says preview',
    env: { ...FLAG_ON, VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'preview', NODE_ENV: 'production' },
  },
  {
    label: 'a context where only the inlined client copy is readable',
    env: { ...FLAG_ON, VERCEL_ENV: undefined, NEXT_PUBLIC_VERCEL_ENV: 'production', NODE_ENV: 'production' },
  },
  {
    label: 'a Vercel environment renamed to something unrecognised',
    env: { ...FLAG_ON, VERCEL_ENV: 'prod', NEXT_PUBLIC_VERCEL_ENV: undefined, NODE_ENV: 'production' },
  },
  {
    label: 'a production build running outside Vercel',
    env: { ...FLAG_ON, VERCEL_ENV: undefined, NEXT_PUBLIC_VERCEL_ENV: undefined, NODE_ENV: 'production' },
  },
]

function createLobbyRequest(gameType: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/lobby', {
    method: 'POST',
    body: JSON.stringify({ name: "Liar's Party", maxPlayers: 8, gameType }),
  })
}

describe('#1054 ENABLE_IN_DEVELOPMENT_GAMES', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma as any))
    mockPrisma.lobbies.findFirst.mockResolvedValue(null)
    mockPrisma.lobbies.create.mockResolvedValue(CREATED_LOBBY as any)
    mockGetRequestAuthUser.mockResolvedValue(HOST as any)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }
  })

  describe('POST /api/lobby stays shut on production', () => {
    for (const { label, env } of PRODUCTION_ENVIRONMENTS) {
      it(`answers 400 for an in-development game on ${label}`, async () => {
        applyEnv(env)

        const response = await CREATE_LOBBY(createLobbyRequest('liars_party'))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toBe('Game type is coming soon')
        expect(mockPrisma.lobbies.create).not.toHaveBeenCalled()
      })

      it(`refuses to read the flag at all on ${label}`, () => {
        // The one claim in this suite that needs no catalog entry, and the one the
        // stand-in above cannot flatter: the real flag function, the real
        // environment, both variables on, and the answer is still no.
        applyEnv(env)

        expect(isInDevelopmentGamePlayEnabled()).toBe(false)
      })
    }

    it('leaves the gate itself closed for the in-development game on production', () => {
      applyEnv(PRODUCTION_ENVIRONMENTS[0].env)

      expect(isTemporarilyUnavailableGameType('liars_party')).toBe(true)
      // Sketch & Guess was the second half of this line until #873 released it.
      // It is `available` in the static catalog now, on production like everywhere
      // else, so the gate is open for it and this says which of the two it is.
      expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)
    })

    it('still lets a released game through on production', async () => {
      applyEnv(PRODUCTION_ENVIRONMENTS[0].env)

      const response = await CREATE_LOBBY(createLobbyRequest('yahtzee'))

      expect(response.status).toBe(200)
      expect(mockPrisma.lobbies.create).toHaveBeenCalled()
    })
  })

  describe('POST /api/lobby opens where the work happens', () => {
    it('creates the lobby on a preview deployment', async () => {
      applyEnv({ ...FLAG_ON, VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_ENV: 'preview', NODE_ENV: 'production' })

      const response = await CREATE_LOBBY(createLobbyRequest('liars_party'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.lobby.code).toBe('DEV123')
      expect(isTemporarilyUnavailableGameType('liars_party')).toBe(false)
    })

    it('creates the lobby on a laptop, where nothing declares a Vercel environment', async () => {
      applyEnv({ ...FLAG_ON, VERCEL_ENV: undefined, NEXT_PUBLIC_VERCEL_ENV: undefined, NODE_ENV: 'development' })

      const response = await CREATE_LOBBY(createLobbyRequest('liars_party'))

      expect(response.status).toBe(200)
      expect(mockPrisma.lobbies.create).toHaveBeenCalled()
    })

    it('is the flag, not the environment, that opens it', async () => {
      applyEnv({ VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_ENV: 'preview', NODE_ENV: 'development' })

      const response = await CREATE_LOBBY(createLobbyRequest('liars_party'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Game type is coming soon')
    })

    it('leaves the entries whose pages do not exist where they are', async () => {
      // #975 stripped `route` from fake_artist and telephone_doodle because nothing is
      // served under app/games for either, so promoting them hands a developer a 404
      // instead of a game. They are held back by that missing field, not by their names -
      // see the shape suite below. Since #873 they are also the only in-development
      // entries left, which is why this is read off the real catalog: the stand-in must
      // not be able to answer for them.
      applyEnv({ ...FLAG_ON, VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_ENV: 'preview', NODE_ENV: 'development' })

      expect(isTemporarilyUnavailableGameType('liars_party')).toBe(false)
      expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)

      const { getAvailableGameTypes, getCatalogGames } = jest.requireActual('@/lib/game-catalog')
      expect(getAvailableGameTypes()).not.toContain('fake_artist')
      expect(getAvailableGameTypes()).not.toContain('telephone_doodle')
      // Both are still in-development in the real catalog, so the two lines above are
      // about entries the flag was asked to promote and would not.
      const inDevelopment = getCatalogGames()
        .filter((game: { availability: string }) => game.availability === 'in-development')
        .map((game: { id: string }) => game.id)
      expect([...inDevelopment].sort()).toEqual(['fake-artist', 'telephone-doodle'])
    })
  })

  /**
   * The flag is read twice, and until now no case could tell the two reads apart: every row
   * above sets both variables, so deleting either read left the suite green. They are not
   * interchangeable. `ENABLE_IN_DEVELOPMENT_GAMES` is the one a server route sees;
   * `NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES` is the only one Next inlines into a client
   * bundle. Seven `'use client'` files read the catalog through this same chokepoint, five of
   * them on surfaces a visitor sees - `app/lobby/create/page.tsx`,
   * `components/HomePage/GameRibbon.tsx`, `components/HomePage/QuickPlayButton.tsx`,
   * `components/PlayerStatsDashboard.tsx` and `app/lobby/[code]/components/TryBotGamesBanner.tsx`
   * (the other two are under `app/dev/`). A gate that only opened server-side would answer 200
   * for a game no picker on the site ever lists - confirmed in a real browser on 2026-09-20:
   * with only the server variable set the server-rendered home page carried
   * `href="/games/liars-party"` and the hydrated page did not.
   *
   * Jest runs both halves in one process, so these cases pin that each variable alone is
   * load-bearing; they cannot prove the browser inlining itself. That is why CLAUDE.md now
   * names both variables everywhere it names one.
   */
  describe('both environment reads are load-bearing', () => {
    it('opens the route with only the server variable set', async () => {
      applyEnv({ ENABLE_IN_DEVELOPMENT_GAMES: 'true', NODE_ENV: 'development' })

      const response = await CREATE_LOBBY(createLobbyRequest('liars_party'))

      expect(response.status).toBe(200)
      expect(mockPrisma.lobbies.create).toHaveBeenCalled()
    })

    it('opens the route and the catalog with only the NEXT_PUBLIC variable set', async () => {
      applyEnv({ NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES: 'true', NODE_ENV: 'development' })

      const response = await CREATE_LOBBY(createLobbyRequest('liars_party'))

      expect(response.status).toBe(200)

      // The catalog read is the client half's view of the same chokepoint.
      const { getAvailableGameTypes } = await import('@/lib/game-catalog')
      expect(getAvailableGameTypes()).toContain('liars_party')

      // And the variable is what put it there: cleared, the same read drops it again.
      // Sketch & Guess used to be the second name on this line, and since #873 it is
      // in the list with the flag on or off, so it is no longer evidence about the
      // flag - it is evidence that the release is in the catalog and not in an
      // environment variable, which is what this pair of lines now says.
      applyEnv({ NODE_ENV: 'development' })
      expect(getAvailableGameTypes()).not.toContain('liars_party')
      expect(getAvailableGameTypes()).toContain('sketch_and_guess')
    })

    it('stays shut when neither variable is set', async () => {
      applyEnv({ NODE_ENV: 'development' })

      const response = await CREATE_LOBBY(createLobbyRequest('liars_party'))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Game type is coming soon')
    })
  })

  /**
   * Which entries the flag promotes is a question about the entry, not about its name.
   *
   * The branch first answered it with a hardcoded two-name denylist, which gives the right
   * answer for today's catalog and the wrong one for the next entry: a game added
   * `in-development` before its pages exist is not one of the two names, so it would be
   * promoted straight into the 404 the exclusion exists to prevent. The synthetic entries
   * below are that next entry. `isFlagPromotableEntry` asks for the three fields
   * `AvailableGameCatalogEntry` declares - `gameType`, `route`, `lobbyCreateConfig` - because
   * promotion writes `availability: 'available'` and adds none of them.
   */
  describe('promotion is decided by the entry shape', () => {
    const BASE = {
      id: 'future-game',
      nameKey: 'games.future_game.name',
      descriptionKey: 'games.future_game.description',
      players: '2-4',
      difficultyKey: 'games.future_game.difficulty',
      color: 'from-gray-400 to-gray-600',
      availability: 'in-development' as const,
    }

    const LOBBY_CREATE_CONFIG = {
      gradient: 'from-gray-500 to-gray-700',
      allowedPlayers: [2, 3, 4],
      defaultMaxPlayers: 4,
    }

    it('withholds a future entry that has no route', async () => {
      const { isFlagPromotableEntry } = await import('@/lib/game-catalog')

      expect(
        isFlagPromotableEntry({
          ...BASE,
          gameType: 'liars_party',
          lobbyCreateConfig: LOBBY_CREATE_CONFIG,
        })
      ).toBe(false)
    })

    it('withholds a future entry that has no lobbyCreateConfig', async () => {
      const { isFlagPromotableEntry } = await import('@/lib/game-catalog')

      expect(
        isFlagPromotableEntry({
          ...BASE,
          gameType: 'liars_party',
          route: '/games/future-game/lobbies',
        })
      ).toBe(false)
    })

    it('withholds a future entry that has no gameType', async () => {
      const { isFlagPromotableEntry } = await import('@/lib/game-catalog')

      expect(
        isFlagPromotableEntry({
          ...BASE,
          route: '/games/future-game/lobbies',
          lobbyCreateConfig: LOBBY_CREATE_CONFIG,
        })
      ).toBe(false)
    })

    it('promotes a future entry that carries all three', async () => {
      const { isFlagPromotableEntry } = await import('@/lib/game-catalog')

      expect(
        isFlagPromotableEntry({
          ...BASE,
          gameType: 'liars_party',
          route: '/games/future-game/lobbies',
          lobbyCreateConfig: LOBBY_CREATE_CONFIG,
        })
      ).toBe(true)
    })

    it('withholds every in-development entry the shipped catalog has', () => {
      // The real module, not the stand-in: this test is the one that is about the
      // catalog as it ships.
      const { getCatalogGames, getAvailableGameTypes, isFlagPromotableEntry } =
        jest.requireActual('@/lib/game-catalog')

      // Recompute the split from the catalog itself, so a new in-development entry is
      // covered the day it is added rather than the day someone remembers this file.
      applyEnv({ NODE_ENV: 'development' })
      const gated = getCatalogGames().filter((game) => game.availability === 'in-development')
      const shouldWithhold = gated
        .filter((game) => !isFlagPromotableEntry(game))
        .map((game) => game.gameType)
        .filter((gameType): gameType is NonNullable<typeof gameType> => gameType !== undefined)
      const shouldPromote = gated
        .filter((game) => isFlagPromotableEntry(game))
        .map((game) => game.gameType)
        .filter((gameType): gameType is NonNullable<typeof gameType> => gameType !== undefined)

      // fake-artist and telephone-doodle have no route (#975) and stay withheld. Checkers
      // (#1083) and Ludo (#1084) were this split's promote side until they went public on
      // 2026-09-24; the promote side is exercised on the held-back fixture elsewhere in
      // this file, and a new in-development game with pages lands here on its own.
      expect(gated.length).toBeGreaterThan(0)
      expect(shouldWithhold.length).toBeGreaterThan(0)
      expect(shouldPromote).not.toContain('checkers')
      expect(shouldPromote).not.toContain('ludo')
      expect(shouldWithhold.length + shouldPromote.length).toBe(gated.length)

      const withoutFlag = getAvailableGameTypes()
      for (const gameType of shouldPromote) {
        expect(withoutFlag).not.toContain(gameType)
      }

      applyEnv({ ...FLAG_ON, NODE_ENV: 'development' })
      const promoted = getAvailableGameTypes()

      for (const gameType of shouldWithhold) {
        expect(promoted).not.toContain(gameType)
      }
      for (const gameType of shouldPromote) {
        expect(promoted).toContain(gameType)
      }
    })

    it('promotes an in-development entry that carries all three, through the catalog itself', () => {
      // The promote side of the same split, which the shipped catalog has had no subject
      // for since #873. This is the one place the branch inside `getCatalogGames` -
      // `isInDevelopmentGamePlayEnabled() && isFlagPromotableEntry(game)` - is exercised
      // end to end rather than a field at a time: the entry goes in in-development and has
      // to come back out `available`, with the real flag read deciding it. The four cases
      // above call `isFlagPromotableEntry` directly, so they hold even when nothing calls
      // it; this one does not.
      const { getCatalogGames, getAvailableGameTypes, isFlagPromotableEntry } =
        jest.requireActual('@/lib/game-catalog')

      applyEnv({ NODE_ENV: 'development' })
      const catalog = heldBackCatalog(getCatalogGames())
      const gated = getCatalogGames({ catalog }).filter(
        (game) => game.availability === 'in-development'
      )
      const shouldPromote = gated
        .filter(isFlagPromotableEntry)
        .map((game) => game.gameType)
        .filter((gameType): gameType is NonNullable<typeof gameType> => gameType !== undefined)
      const shouldWithhold = gated
        .filter((game) => !isFlagPromotableEntry(game))
        .map((game) => game.gameType)
        .filter((gameType): gameType is NonNullable<typeof gameType> => gameType !== undefined)

      // Both loops below have something to iterate, which is the whole point of the
      // fixture: a loop that never executes is not coverage.
      expect(shouldPromote.length).toBeGreaterThan(0)
      expect(shouldWithhold.length).toBeGreaterThan(0)

      // Flag off, so what the flag does is visible rather than assumed.
      const withoutFlag = getAvailableGameTypes({ catalog })
      for (const gameType of shouldPromote) {
        expect(withoutFlag).not.toContain(gameType)
      }

      applyEnv({ ...FLAG_ON, NODE_ENV: 'development' })
      const promoted = getAvailableGameTypes({ catalog })

      for (const gameType of shouldPromote) {
        expect(promoted).toContain(gameType)
      }
      for (const gameType of shouldWithhold) {
        expect(promoted).not.toContain(gameType)
      }
    })
  })
})
