/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/quick-play/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { recordLobbyParticipation } from '@/lib/lobby-participation'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    lobbies: {
      findMany: jest.fn(),
      // #907: the one-open-lobby check runs before every create.
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    players: {
      create: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
  rateLimitPresets: { api: {} },
}))

// #920: Quick Play records who sat in the lobby, with the acquisition cookie.
jest.mock('@/lib/lobby-participation', () => ({
  recordLobbyParticipation: jest.fn(async () => true),
}))

jest.mock('@/lib/bot-helpers', () => ({
  getOrCreateBotUser: jest.fn(async () => ({ id: 'bot-1', username: 'Bot' })),
  isPrismaUniqueConstraintError: jest.fn(() => false),
}))

const makeRequest = (body: unknown, cookie?: string) =>
  new NextRequest('http://localhost/api/quick-play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })

describe('POST /api/quick-play', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1', username: 'Tester', isGuest: false })
    ;(prisma.lobbies.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.lobbies.create as jest.Mock).mockResolvedValue({
      id: 'lobby-new',
      code: '1234',
      games: [{ id: 'game-1' }],
    })
    ;(prisma.players.create as jest.Mock).mockResolvedValue({})
  })

  it('accepts a game without bot support (alias) and creates a lobby with NO bot fill', async () => {
    const res = await POST(makeRequest({ gameType: 'alias' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ lobbyCode: '1234', isNew: true })
    // Only the lobby (with the human creator nested inside) is created —
    // no standalone players.create calls, which is how bots get added.
    expect(prisma.players.create).not.toHaveBeenCalled()
  })

  it('rejects forceSolo for a game without bot support', async () => {
    const res = await POST(makeRequest({ gameType: 'guess_the_spy', forceSolo: true }))
    expect(res.status).toBe(400)
    expect(prisma.lobbies.create).not.toHaveBeenCalled()
  })

  it('still bot-fills a bot-supported game on lobby creation', async () => {
    const res = await POST(makeRequest({ gameType: 'tic_tac_toe' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.isNew).toBe(true)
    // TTT minPlayers is 2: 1 human + at least 1 bot via players.create.
    expect(prisma.players.create).toHaveBeenCalled()
  })

  it('joins an existing open lobby before creating a new one (non-bot game)', async () => {
    ;(prisma.lobbies.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'lobby-1',
        code: '5678',
        name: 'Open Alias',
        maxPlayers: 8,
        gameType: 'alias',
        creatorId: 'someone-else',
        createdAt: new Date(),
        games: [{ id: 'game-9', status: 'waiting', createdAt: new Date(), _count: { players: 3 } }],
      },
    ])
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
      fn({
        players: {
          count: jest.fn(async () => 3),
          create: jest.fn(async () => ({})),
        },
      })
    )

    const res = await POST(makeRequest({ gameType: 'alias' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ lobbyCode: '5678', isNew: false })
    expect(prisma.lobbies.create).not.toHaveBeenCalled()
  })

  it('rejects unknown game types', async () => {
    const res = await POST(makeRequest({ gameType: 'chess' }))
    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated requests', async () => {
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue(null)
    const res = await POST(makeRequest({ gameType: 'alias' }))
    expect(res.status).toBe(401)
  })

  it('creates quick-play lobbies with a 45s turn timer (#779)', async () => {
    const res = await POST(makeRequest({ gameType: 'tic_tac_toe' }))
    expect(res.status).toBe(200)

    const createArgs = (prisma.lobbies.create as jest.Mock).mock.calls[0][0]
    expect(createArgs.data.turnTimer).toBe(45)
  })

  it('starts yahtzee quick-play in short mode (#779)', async () => {
    const res = await POST(makeRequest({ gameType: 'yahtzee' }))
    expect(res.status).toBe(200)

    const createArgs = (prisma.lobbies.create as jest.Mock).mock.calls[0][0]
    expect(createArgs.data.turnTimer).toBe(45)
    const rawState = createArgs.data.games.create.state
    const persistedState = typeof rawState === 'string' ? JSON.parse(rawState) : rawState
    expect(persistedState.data.mode).toBe('short')
  })

  describe('participation (#920)', () => {
    it('records the human who created a fresh lobby, with the acquisition cookie', async () => {
      const res = await POST(makeRequest({ gameType: 'tic_tac_toe' }, 'bd_src=utm:reddit/post'))
      expect(res.status).toBe(200)

      expect(recordLobbyParticipation).toHaveBeenCalledTimes(1)
      expect(recordLobbyParticipation).toHaveBeenCalledWith({
        lobbyId: 'lobby-new',
        lobbyCode: '1234',
        gameType: 'tic_tac_toe',
        userId: 'user-1',
        isGuest: false,
        signupSource: 'utm:reddit/post',
      })
    })

    it('records the human who joined an existing lobby', async () => {
      ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'guest-1', username: 'Guest', isGuest: true })
      ;(prisma.lobbies.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'lobby-1',
          code: '5678',
          name: 'Open Alias',
          maxPlayers: 8,
          gameType: 'alias',
          creatorId: 'someone-else',
          createdAt: new Date(),
          games: [{ id: 'game-9', status: 'waiting', createdAt: new Date(), _count: { players: 3 } }],
        },
      ])
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn({
          players: {
            count: jest.fn(async () => 3),
            create: jest.fn(async () => ({})),
          },
        })
      )

      const res = await POST(makeRequest({ gameType: 'alias' }))
      expect(res.status).toBe(200)

      expect(recordLobbyParticipation).toHaveBeenCalledTimes(1)
      expect(recordLobbyParticipation).toHaveBeenCalledWith({
        lobbyId: 'lobby-1',
        lobbyCode: '5678',
        gameType: 'alias',
        userId: 'guest-1',
        isGuest: true,
        signupSource: null,
      })
    })
  })
})
