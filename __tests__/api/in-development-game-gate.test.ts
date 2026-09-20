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
 */

import { NextRequest } from 'next/server'
import { POST as CREATE_LOBBY } from '@/app/api/lobby/route'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'

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
    }

    it('leaves the gate itself closed for every in-development game on production', () => {
      applyEnv(PRODUCTION_ENVIRONMENTS[0].env)

      expect(isTemporarilyUnavailableGameType('liars_party')).toBe(true)
      expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(true)
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
      // see the shape suite below.
      applyEnv({ ...FLAG_ON, VERCEL_ENV: 'preview', NEXT_PUBLIC_VERCEL_ENV: 'preview', NODE_ENV: 'development' })

      expect(isTemporarilyUnavailableGameType('liars_party')).toBe(false)
      expect(isTemporarilyUnavailableGameType('sketch_and_guess')).toBe(false)

      const { getAvailableGameTypes } = await import('@/lib/game-catalog')
      expect(getAvailableGameTypes()).not.toContain('fake_artist')
      expect(getAvailableGameTypes()).not.toContain('telephone_doodle')
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

    it('is the predicate the real catalog is filtered through', async () => {
      applyEnv({ ...FLAG_ON, NODE_ENV: 'development' })

      const { getCatalogGames, getAvailableGameTypes, isFlagPromotableEntry } = await import(
        '@/lib/game-catalog'
      )

      // Recompute the expected split from the catalog itself, so a new in-development entry
      // is covered the day it is added rather than the day someone remembers this file.
      applyEnv({ NODE_ENV: 'development' })
      const gated = getCatalogGames().filter((game) => game.availability === 'in-development')
      const shouldPromote = gated.filter(isFlagPromotableEntry).map((game) => game.gameType)
      const shouldWithhold = gated
        .filter((game) => !isFlagPromotableEntry(game))
        .map((game) => game.gameType)
        .filter((gameType): gameType is NonNullable<typeof gameType> => gameType !== undefined)

      expect(shouldPromote.length).toBeGreaterThan(0)
      expect(shouldWithhold.length).toBeGreaterThan(0)

      applyEnv({ ...FLAG_ON, NODE_ENV: 'development' })
      const promoted = getAvailableGameTypes()

      for (const gameType of shouldPromote) {
        expect(promoted).toContain(gameType)
      }
      for (const gameType of shouldWithhold) {
        expect(promoted).not.toContain(gameType)
      }
    })
  })
})
