/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { GET } from '@/app/api/user/export/route'
import { prisma } from '@/lib/db'

const mockRateLimiter = jest.fn()

jest.mock('@/lib/db', () => {
  const list = () => ({ findMany: jest.fn() })
  return {
    prisma: {
      users: { findUnique: jest.fn() },
      players: list(),
      lobbies: list(),
      purchaseConsents: list(),
      friendships: list(),
      friendRequests: list(),
      lobbyInvites: list(),
      notifications: list(),
      feedback: list(),
      userAchievements: list(),
      pushSubscriptions: list(),
    },
  }
})
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => (request) => mockRateLimiter(request),
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const LIST_DELEGATES = [
  'players',
  'lobbies',
  'purchaseConsents',
  'friendships',
  'friendRequests',
  'lobbyInvites',
  'notifications',
  'feedback',
  'userAchievements',
  'pushSubscriptions',
]

// Two accounts in the "database". Each mock answers only for the user its where clause
// names, the way Postgres would, so a query scoped to the wrong user returns u2's rows.
const ROWS = {
  u1: {
    profile: { id: 'u1', email: 'one@example.com', username: 'one', accounts: [], accountPreferences: null, notificationPreferences: null },
    feedback: [{ type: 'bug', status: 'open', message: 'u1 feedback', email: 'one@example.com', pageUrl: null, createdAt: new Date() }],
  },
  u2: {
    profile: { id: 'u2', email: 'two@example.com', username: 'two', accounts: [], accountPreferences: null, notificationPreferences: null },
    feedback: [{ type: 'bug', status: 'open', message: 'u2 secret feedback', email: 'two@example.com', pageUrl: null, createdAt: new Date() }],
  },
}

function request(query = '') {
  return new NextRequest(`https://boardly.online/api/user/export${query}`)
}

function collectStrings(value, into = []) {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, into))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, into))
  return into
}

describe('GET /api/user/export (#1127)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRateLimiter.mockResolvedValue(null)
    getServerSession.mockResolvedValue({ user: { id: 'u1' } })
    prisma.users.findUnique.mockImplementation(({ where }) => Promise.resolve(ROWS[where.id]?.profile ?? null))
    for (const name of LIST_DELEGATES) prisma[name].findMany.mockResolvedValue([])
    prisma.feedback.findMany.mockImplementation(({ where }) => Promise.resolve(ROWS[where.userId]?.feedback ?? []))
  })

  it('refuses a request without a session', async () => {
    getServerSession.mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(prisma.users.findUnique).not.toHaveBeenCalled()
  })

  it('answers 429 when rate limited, before reading anything', async () => {
    mockRateLimiter.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }))

    const response = await GET(request())

    expect(response.status).toBe(429)
    expect(getServerSession).not.toHaveBeenCalled()
  })

  it('returns the signed-in user\'s data as a JSON attachment', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="boardly-data-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(body.account.id).toBe('u1')
    expect(body.feedback).toEqual([expect.objectContaining({ message: 'u1 feedback' })])
  })

  it('cannot be pointed at another user', async () => {
    const response = await GET(request('?userId=u2&id=u2&user=u2'))
    const body = await response.json()

    expect(body.account.id).toBe('u1')
    expect(JSON.stringify(body)).not.toContain('u2 secret feedback')
    expect(JSON.stringify(body)).not.toContain('two@example.com')

    // Every query is scoped to the session user and nothing else.
    const calls = [
      ...prisma.users.findUnique.mock.calls,
      ...LIST_DELEGATES.flatMap((name) => prisma[name].findMany.mock.calls),
    ]
    expect(calls).toHaveLength(1 + LIST_DELEGATES.length)
    for (const [args] of calls) {
      const whereStrings = collectStrings(args.where)
      expect(whereStrings).toContain('u1')
      expect(whereStrings).not.toContain('u2')
    }
  })

  it('never selects secrets', async () => {
    await GET(request())

    const select = prisma.users.findUnique.mock.calls[0][0].select
    expect(select.passwordHash).toBeUndefined()
    expect(select.totpSecret).toBeUndefined()
    expect(select.totpPendingSecret).toBeUndefined()
    expect(select.accounts.select).toEqual({ provider: true, type: true, providerAccountId: true })

    const pushSelect = prisma.pushSubscriptions.findMany.mock.calls[0][0].select
    expect(pushSelect.p256dh).toBeUndefined()
    expect(pushSelect.auth).toBeUndefined()
  })

  it('names other people by username only, and drops other players from game results', async () => {
    prisma.friendships.findMany.mockResolvedValue([
      { user1Id: 'u1', createdAt: new Date(), user1: { username: 'one' }, user2: { username: 'two' } },
    ])
    prisma.players.findMany.mockResolvedValue([
      {
        position: 0, score: 10, finalScore: 10, placement: 1, isWinner: true, scorecard: null, leftAt: null, createdAt: new Date(),
        game: {
          id: 'g1', gameType: 'yahtzee', status: 'finished', createdAt: new Date(), startedAt: null, endedAt: null, durationSeconds: 5,
          terminalMetadata: { outcome: 'win', isDraw: false, winnerUserId: 'u1', playerResults: [{ userId: 'u3' }] },
          lobby: { code: '1234', name: 'Lobby' },
        },
      },
    ])

    const body = await (await GET(request())).json()

    expect(body.friends).toEqual([{ username: 'two', since: expect.any(String) }])
    expect(body.games[0].result).toEqual({ outcome: 'win', isDraw: false, reason: null })
    expect(JSON.stringify(body.games)).not.toContain('u3')
  })
})
