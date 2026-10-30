/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - the Prisma stand-in below is intentionally loose

/**
 * POST /api/lobby/[code]/reopen (#1594): an old invite link brings two friends back to
 * their table. Driven through the real route, the real participation writer and the real
 * engines, against an in-memory database whose conditional update is atomic the way a
 * Postgres UPDATE ... WHERE is, so two reopens that interleave behave as they would there.
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lobby/[code]/reopen/route'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { clearChatHistory } from '@/lib/chat-history'
import { participantKeys } from '@/lib/lobby-participation'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

type Row = Record<string, any>

const db: {
  lobbies: Row[]
  games: Row[]
  participations: Row[]
  events: Row[]
} = { lobbies: [], games: [], participations: [], events: [] }

// Every query yields before it answers, so two requests started together interleave
// at each await instead of running one after the other.
const yieldTurn = () => new Promise((resolve) => setTimeout(resolve, 0))

function matchesStatus(game: Row, status: unknown): boolean {
  if (status === undefined) return true
  if (typeof status === 'string') return game.status === status
  if (status && typeof status === 'object' && Array.isArray((status as Row).in)) {
    return (status as Row).in.includes(game.status)
  }
  return false
}

function gamesWhere(where: Row = {}): Row[] {
  return db.games.filter(
    (game) =>
      (where.lobbyId === undefined || game.lobbyId === where.lobbyId) &&
      matchesStatus(game, where.status)
  )
}

const fakePrisma = {
  lobbies: {
    findUnique: jest.fn(async ({ where, omit, select }) => {
      // Prisma refuses this pair at runtime with a PrismaClientValidationError.
      if (omit && select) throw new Error('Please either use `omit` or `select`, but not both at the same time.')
      await yieldTurn()
      const lobby = db.lobbies.find((row) => row.code === where.code)
      return lobby ? { ...lobby, kickedUserIds: [...lobby.kickedUserIds] } : null
    }),
    // The one-open-lobby check (lib/lobby-limit.ts).
    findFirst: jest.fn(async ({ where }) => {
      await yieldTurn()
      const open = db.lobbies.find(
        (row) =>
          row.creatorId === where.creatorId &&
          row.isActive === true &&
          db.games.some((game) => game.lobbyId === row.id && ['waiting', 'playing'].includes(game.status))
      )
      return open ? { code: open.code } : null
    }),
    // Atomic, like UPDATE ... WHERE under a row lock: no await between the test and the write.
    updateMany: jest.fn(async ({ where, data }) => {
      await yieldTurn()
      const matching = db.lobbies.filter(
        (row) =>
          row.id === where.id && (where.isActive === undefined || row.isActive === where.isActive)
      )
      for (const row of matching) Object.assign(row, data)
      return { count: matching.length }
    }),
  },
  games: {
    findFirst: jest.fn(async ({ where, orderBy }) => {
      await yieldTurn()
      const rows = gamesWhere(where)
      if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt)
      return rows[0] ?? null
    }),
    create: jest.fn(async ({ data }) => {
      await yieldTurn()
      const { players, ...rest } = data
      const game = {
        id: `game-${db.games.length + 1}`,
        createdAt: Date.now() + db.games.length,
        ...rest,
        players: players?.create ?? [],
      }
      db.games.push(game)
      return { id: game.id }
    }),
  },
  lobbyParticipations: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async ({ data }) => {
      await yieldTurn()
      if (db.participations.some((row) => row.lobbyId === data.lobbyId && row.participantKey === data.participantKey)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      }
      const row = { ...data, joinedAt: new Date() }
      db.participations.push(row)
      return { joinedAt: row.joinedAt }
    }),
    count: jest.fn(async ({ where }) => db.participations.filter((row) => row.lobbyId === where.lobbyId).length),
  },
  operationalEvents: {
    create: jest.fn(async ({ data }) => {
      db.events.push(data)
      return data
    }),
  },
  $transaction: jest.fn(async (callback) => {
    const held: string[] = []
    // pg_advisory_xact_lock: waits for the key, holds it until the transaction ends.
    const $executeRaw = async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      const key = String(values[0])
      while (locks.has(key)) await locks.get(key)
      let release = () => undefined
      locks.set(key, new Promise<void>((resolve) => { release = resolve }))
      releases.set(key, release)
      held.push(key)
      return 1
    }
    try {
      return await callback({ ...fakePrisma, $executeRaw })
    } finally {
      for (const key of held) {
        locks.delete(key)
        releases.get(key)?.()
      }
    }
  }),
}

const locks = new Map<string, Promise<void>>()
const releases = new Map<string, () => void>()

jest.mock('@/lib/db', () => ({ get prisma() { return fakePrisma } }))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
const limitedIdentities = new Set<string>()
const mockLimiter = jest.fn(async (_request, options?: { identity?: string }) =>
  options?.identity && limitedIdentities.has(options.identity)
    ? new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), { status: 429 })
    : null
)
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => (...args) => mockLimiter(...args)),
  rateLimitPresets: { lobbyRematch: {} },
}))
const mockUnreleased = new Set<string>()
jest.mock('@/lib/public-game-access', () => {
  const actual = jest.requireActual('@/lib/public-game-access')
  return {
    ...actual,
    isTemporarilyUnavailableGameType: (gameType: string) =>
      mockUnreleased.has(gameType) || actual.isTemporarilyUnavailableGameType(gameType),
  }
})
jest.mock('@/lib/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), logger: log }
})
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn().mockResolvedValue(true) }))
jest.mock('@/lib/chat-history', () => ({ clearChatHistory: jest.fn().mockResolvedValue(undefined) }))
// bcrypt is a native addon that does not load in the edge VM; the stand-in keeps the
// contract the route relies on – a stored password matches only the right attempt.
jest.mock('@/lib/lobby-password', () => ({
  verifyLobbyPassword: jest.fn(async (stored: string | null, provided?: string) => !stored || stored === `hash:${provided}`),
}))

const mockAuth = getRequestAuthUser as jest.Mock

function seedClosedLobby(overrides: Row = {}) {
  const lobby = {
    id: 'lobby-1',
    code: '4821',
    name: 'Friday table',
    password: null,
    maxPlayers: 2,
    isActive: false,
    spectatorCount: 0,
    gameType: 'connect_four',
    kickedUserIds: ['kicked-user'],
    createdAt: new Date(Date.now() - 2 * HOUR),
    pseudonymisedAt: null,
    creatorId: 'host-a',
    ...overrides,
  }
  db.lobbies.push(lobby)
  db.games.push({
    id: 'finished-1',
    lobbyId: lobby.id,
    gameType: 'connect_four',
    status: 'finished',
    state: '{"status":"finished","data":{}}',
    createdAt: Date.now() - HOUR,
    players: [{ userId: 'host-a' }, { userId: 'guest-b' }],
  })
  return lobby
}

function reopen(body: Row = {}, code = '4821') {
  return POST(
    new NextRequest(`http://localhost:3000/api/lobby/${code}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code }) }
  )
}

function seedParticipation(lobbyId: string, userId: string) {
  db.participations.push({
    lobbyId,
    lobbyCode: '4821',
    gameType: 'connect_four',
    participantKey: participantKeys(userId)[0],
    isBot: false,
    isGuest: true,
    joinedAt: new Date(Date.now() - HOUR),
  })
}

function asUser(userId: string | null, isGuest = true) {
  mockAuth.mockImplementation(async () => (userId ? { id: userId, username: userId, isGuest } : null))
}

const waitingGames = () => db.games.filter((game) => game.status === 'waiting')

beforeEach(() => {
  jest.clearAllMocks()
  db.lobbies = []
  db.games = []
  db.participations = []
  db.events = []
  limitedIdentities.clear()
  mockUnreleased.clear()
  process.env.PARTICIPATION_HASH_SALT = 'test-salt'
})

describe('POST /api/lobby/[code]/reopen', () => {
  it('reopens a closed table: one waiting game of the same type, the opener seated, the lobby active', async () => {
    seedClosedLobby()
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(waitingGames()).toHaveLength(1)
    const [game] = waitingGames()
    expect(body.gameId).toBe(game.id)
    expect(game.gameType).toBe('connect_four')
    expect(game.players).toEqual([expect.objectContaining({ userId: 'guest-b', position: 0 })])
    expect(db.lobbies[0].isActive).toBe(true)
    expect(broadcastToLobby).toHaveBeenCalledWith('4821', 'game-reset', expect.objectContaining({ gameId: game.id }))
  })

  it('creates exactly one waiting game when two reopens race', async () => {
    seedClosedLobby()
    mockAuth.mockImplementationOnce(async () => ({ id: 'guest-b', username: 'B', isGuest: true }))
    mockAuth.mockImplementationOnce(async () => ({ id: 'host-a', username: 'A', isGuest: true }))

    const responses = await Promise.all([reopen(), reopen()])

    expect(waitingGames()).toHaveLength(1)
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409])
    const loser = responses.find((res) => res.status === 409)
    expect((await loser.json()).code).toBe('LOBBY_NOT_CLOSED')
  })

  it('writes lobby_reopened with the game type and age bucket, and a LobbyParticipations row', async () => {
    seedClosedLobby()
    asUser('guest-b')

    await reopen()

    expect(db.events).toEqual([
      expect.objectContaining({
        eventName: 'lobby_reopened',
        metricType: 'flow',
        gameType: 'connect_four',
        isGuest: true,
        payload: expect.objectContaining({ lobby_code: '4821', age_bucket: '1h_to_3h' }),
      }),
    ])
    expect(db.participations).toEqual([
      expect.objectContaining({ lobbyId: 'lobby-1', lobbyCode: '4821', gameType: 'connect_four', isGuest: true }),
    ])
  })

  it('refuses a kicked player with 403 and leaves the table closed', async () => {
    seedClosedLobby()
    asUser('kicked-user')

    const res = await reopen()

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('KICKED_FROM_LOBBY')
    expect(waitingGames()).toHaveLength(0)
    expect(db.lobbies[0].isActive).toBe(false)
  })

  it('refuses a password lobby without the password with 403', async () => {
    seedClosedLobby({ password: 'hash:secret' })
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('INVALID_PASSWORD')
    expect(waitingGames()).toHaveLength(0)
    expect(db.lobbies[0].isActive).toBe(false)
  })

  it('opens a password lobby for the right password and keeps the password and kick list', async () => {
    seedClosedLobby({ password: 'hash:secret' })
    asUser('guest-b')

    const res = await reopen({ password: 'secret' })

    expect(res.status).toBe(200)
    expect(db.lobbies[0].password).toBe('hash:secret')
    expect(db.lobbies[0].kickedUserIds).toEqual(['kicked-user'])
  })

  it('makes the opener host when the creator is not the one who came back', async () => {
    seedClosedLobby()
    asUser('guest-b')

    await reopen()

    expect(db.lobbies[0].creatorId).toBe('guest-b')
  })

  it('keeps the creator as host when the creator reopens', async () => {
    seedClosedLobby()
    asUser('host-a')

    await reopen()

    expect(db.lobbies[0].creatorId).toBe('host-a')
  })

  it('makes the opener host of a table whose creator account is gone', async () => {
    seedClosedLobby({ creatorId: null })
    asUser('guest-b')

    await reopen()

    expect(db.lobbies[0].creatorId).toBe('guest-b')
  })

  it('does not carry the old chat into the new game', async () => {
    seedClosedLobby()
    asUser('guest-b')

    await reopen()

    expect(clearChatHistory).toHaveBeenCalledWith('4821')
  })

  it('answers 410 for a lobby created 30 or more days ago', async () => {
    seedClosedLobby({ createdAt: new Date(Date.now() - 30 * DAY) })
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(410)
    expect((await res.json()).code).toBe('LOBBY_TOO_OLD')
    expect(waitingGames()).toHaveLength(0)
  })

  it('answers 410 for a pseudonymised lobby', async () => {
    seedClosedLobby({ pseudonymisedAt: new Date(Date.now() - HOUR) })
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(410)
    expect(waitingGames()).toHaveLength(0)
  })

  it.each(['waiting', 'playing'])('leaves a lobby whose game is still %s as it is', async (status) => {
    seedClosedLobby({ isActive: true })
    db.games.push({ id: 'live-1', lobbyId: 'lobby-1', gameType: 'connect_four', status, createdAt: Date.now(), players: [] })
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('LOBBY_NOT_CLOSED')
    expect(db.games.filter((game) => game.status === 'waiting')).toHaveLength(status === 'waiting' ? 1 : 0)
    expect(db.lobbies[0].creatorId).toBe('host-a')
  })

  it('sends a player who already holds an open lobby to it, as lobby creation does', async () => {
    seedClosedLobby()
    db.lobbies.push({ id: 'lobby-2', code: '7777', isActive: true, creatorId: 'guest-b', kickedUserIds: [] })
    db.games.push({ id: 'other-1', lobbyId: 'lobby-2', status: 'waiting', createdAt: Date.now(), players: [] })
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual(expect.objectContaining({ code: 'LOBBY_ALREADY_OPEN', lobbyCode: '7777' }))
    expect(db.lobbies[0].isActive).toBe(false)
  })

  it('asks for an identity first', async () => {
    seedClosedLobby()
    asUser(null)

    const res = await reopen()

    expect(res.status).toBe(401)
    expect(waitingGames()).toHaveLength(0)
  })

  it('counts every reopen against the opener as well as their address, across every code', async () => {
    seedClosedLobby()
    asUser('guest-b')
    limitedIdentities.add('guest-b')

    const res = await reopen()

    expect(res.status).toBe(429)
    expect(mockLimiter).toHaveBeenCalledWith(expect.anything(), { identity: 'guest-b' })
    expect(waitingGames()).toHaveLength(0)
  })

  it('lets one person reopen only one of two closed tables when both reopens race', async () => {
    seedClosedLobby()
    seedClosedLobby({ id: 'lobby-2', code: '5932' })
    asUser('guest-b')

    const responses = await Promise.all([reopen({}, '4821'), reopen({}, '5932')])

    expect(waitingGames()).toHaveLength(1)
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409])
    const loser = responses.find((res) => res.status === 409)
    expect((await loser.json()).code).toBe('LOBBY_ALREADY_OPEN')
    expect(db.lobbies.filter((lobby) => lobby.isActive)).toHaveLength(1)
  })

  it('does not count a reopen as a second human joining', async () => {
    seedClosedLobby()
    seedParticipation('lobby-1', 'host-a')
    asUser('stranger-c')

    await reopen()

    expect(db.events.map((event) => event.eventName)).toEqual(['lobby_reopened'])
    expect(db.participations).toHaveLength(2)
  })

  it('keeps one participation row for a player who sat at this table before', async () => {
    seedClosedLobby()
    seedParticipation('lobby-1', 'host-a')
    seedParticipation('lobby-1', 'guest-b')
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(200)
    // The unique (lobbyId, participantKey) index absorbs a returning player: one row each.
    expect(db.participations).toHaveLength(2)
    expect(db.events.map((event) => event.eventName)).toEqual(['lobby_reopened'])
  })

  it.each([
    ['taken off the public list', 'connect_four'],
    ['behind a flag that is off', 'telephone_doodle'],
  ])('sends a table whose game is %s to a new table', async (_why, gameType) => {
    if (gameType === 'connect_four') mockUnreleased.add('connect_four')
    seedClosedLobby({ gameType })
    asUser('guest-b')

    const res = await reopen()

    expect(res.status).toBe(410)
    expect((await res.json()).code).toBe('GAME_TYPE_UNAVAILABLE')
    expect(waitingGames()).toHaveLength(0)
    expect(db.lobbies[0].isActive).toBe(false)
  })
})
