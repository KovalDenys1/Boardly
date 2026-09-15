/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { GET as getMember } from '@/app/api/internal/discord/members/[snowflake]/route'
import { POST as postHeartbeat } from '@/app/api/internal/discord/heartbeat/route'
import { prisma } from '@/lib/db'
import { recordCronRun } from '@/lib/cron-heartbeat'

jest.mock('@/lib/db', () => ({
  prisma: {
    accounts: { findUnique: jest.fn() },
    players: { count: jest.fn() },
  },
}))

jest.mock('@/lib/cron-heartbeat', () => ({
  recordCronRun: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { api: {} },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRecordCronRun = recordCronRun as jest.MockedFunction<typeof recordCronRun>

const SECRET = 'discord-internal-secret'
const SNOWFLAKE = '123456789012345678'

function memberRequest(headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000/api/internal/discord/members/${SNOWFLAKE}`, {
    headers,
  })
}

function memberContext(snowflake = SNOWFLAKE) {
  return { params: Promise.resolve({ snowflake }) }
}

function heartbeatRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/internal/discord/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function linkedAccount(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-1',
      username: 'denys',
      isGuest: false,
      suspended: false,
      premiumUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      accountPreferences: { profileVisibility: 'public' },
      ...overrides,
    },
  }
}

describe('/api/internal/discord', () => {
  const originalSecret = process.env.DISCORD_INTERNAL_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.DISCORD_INTERNAL_SECRET = SECRET
    mockPrisma.accounts.findUnique.mockResolvedValue(null)
    mockPrisma.players.count.mockResolvedValue(0)
    mockRecordCronRun.mockResolvedValue(undefined)
  })

  afterAll(() => {
    if (typeof originalSecret === 'string') {
      process.env.DISCORD_INTERNAL_SECRET = originalSecret
    } else {
      delete process.env.DISCORD_INTERNAL_SECRET
    }
  })

  describe('GET /members/[snowflake]', () => {
    it('returns 401 without the authorization header', async () => {
      const response = await getMember(memberRequest(), memberContext())

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
      expect(mockPrisma.accounts.findUnique).not.toHaveBeenCalled()
    })

    it('returns 401 with a wrong secret', async () => {
      const response = await getMember(
        memberRequest({ authorization: 'Bearer not-the-secret' }),
        memberContext()
      )

      expect(response.status).toBe(401)
    })

    it('returns 503 when DISCORD_INTERNAL_SECRET is unset, even with a header', async () => {
      delete process.env.DISCORD_INTERNAL_SECRET

      const response = await getMember(
        memberRequest({ authorization: `Bearer ${SECRET}` }),
        memberContext()
      )

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        error: 'DISCORD_INTERNAL_SECRET is not configured',
      })
    })

    it('rejects a snowflake that is not a snowflake', async () => {
      const response = await getMember(
        memberRequest({ authorization: `Bearer ${SECRET}` }),
        memberContext('denys; drop table')
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.accounts.findUnique).not.toHaveBeenCalled()
    })

    it('reads an unlinked member as { linked: false }', async () => {
      const response = await getMember(
        memberRequest({ authorization: `Bearer ${SECRET}` }),
        memberContext()
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ linked: false })
      expect(mockPrisma.accounts.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            provider_providerAccountId: { provider: 'discord', providerAccountId: SNOWFLAKE },
          },
        })
      )
    })

    it.each(['private', 'friends'])(
      'reads a %s profile exactly like an unlinked member',
      async (profileVisibility) => {
        mockPrisma.accounts.findUnique.mockResolvedValue(
          linkedAccount({ accountPreferences: { profileVisibility } })
        )

        const response = await getMember(
          memberRequest({ authorization: `Bearer ${SECRET}` }),
          memberContext()
        )

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ linked: false })
        expect(mockPrisma.players.count).not.toHaveBeenCalled()
      }
    )

    it('returns the public profile fields for a linked public member', async () => {
      mockPrisma.accounts.findUnique.mockResolvedValue(linkedAccount())
      mockPrisma.players.count.mockResolvedValue(27)

      const response = await getMember(
        memberRequest({ authorization: `Bearer ${SECRET}` }),
        memberContext()
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({
        linked: true,
        username: 'denys',
        gamesPlayed: 27,
        isPremium: true,
        memberSince: '2026-01-02T03:04:05.000Z',
      })
      expect(mockPrisma.players.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          game: { status: { in: ['finished', 'abandoned', 'cancelled'] } },
        },
      })
    })

    it('treats a missing preferences row as public and an expired premium as not premium', async () => {
      mockPrisma.accounts.findUnique.mockResolvedValue(
        linkedAccount({
          accountPreferences: null,
          premiumUntil: new Date(Date.now() - 1000),
        })
      )

      const response = await getMember(
        memberRequest({ authorization: `Bearer ${SECRET}` }),
        memberContext()
      )

      const payload = await response.json()
      expect(payload.linked).toBe(true)
      expect(payload.isPremium).toBe(false)
    })

    it('hides suspended accounts', async () => {
      mockPrisma.accounts.findUnique.mockResolvedValue(linkedAccount({ suspended: true }))

      const response = await getMember(
        memberRequest({ authorization: `Bearer ${SECRET}` }),
        memberContext()
      )

      await expect(response.json()).resolves.toEqual({ linked: false })
    })
  })

  describe('POST /heartbeat', () => {
    it('returns 401 without the authorization header', async () => {
      const response = await postHeartbeat(heartbeatRequest({}))

      expect(response.status).toBe(401)
      expect(mockRecordCronRun).not.toHaveBeenCalled()
    })

    it('returns 503 when the secret is unset', async () => {
      delete process.env.DISCORD_INTERNAL_SECRET

      const response = await postHeartbeat(heartbeatRequest({}, { authorization: `Bearer ${SECRET}` }))

      expect(response.status).toBe(503)
      expect(mockRecordCronRun).not.toHaveBeenCalled()
    })

    // The body below is exactly what boardly-discord/bot/lib/boardly-api.ts:138 posts,
    // from bot/health.ts:96, every five minutes. Keep the two in step: a key renamed on
    // either side is a 400 the bot logs as a warning and nobody reads, and
    // discord_bot_stale stays quiet until a first heartbeat lands, so nothing alerts.
    it('accepts the body the deployed bot actually sends', async () => {
      const response = await postHeartbeat(
        heartbeatRequest(
          { memberCount: 42, openPosts: 3, uptimeS: 600, sha: 'abc1234' },
          { authorization: `Bearer ${SECRET}` }
        )
      )

      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload.ok).toBe(true)
      expect(typeof payload.recordedAt).toBe('string')
      expect(mockRecordCronRun).toHaveBeenCalledTimes(1)
      expect(mockRecordCronRun).toHaveBeenCalledWith({
        cron: 'discord-bot',
        success: true,
        latencyMs: 0,
        reason: undefined,
        payload: { sha: 'abc1234', memberCount: 42, openPosts: 3, uptimeS: 600 },
      })
    })

    it('takes the same body with ready: true, which the bot is adding', async () => {
      const response = await postHeartbeat(
        heartbeatRequest(
          { memberCount: 42, openPosts: 3, uptimeS: 600, sha: 'abc1234', ready: true },
          { authorization: `Bearer ${SECRET}` }
        )
      )

      expect(response.status).toBe(200)
      expect(mockRecordCronRun).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, reason: undefined })
      )
    })

    it('accepts an empty body as a heartbeat', async () => {
      const response = await postHeartbeat(
        heartbeatRequest(undefined, { authorization: `Bearer ${SECRET}` })
      )

      expect(response.status).toBe(200)
      expect(mockRecordCronRun).toHaveBeenCalledWith(
        expect.objectContaining({ cron: 'discord-bot', success: true, latencyMs: 0 })
      )
    })

    it('records a missing ready as ready', async () => {
      await postHeartbeat(
        heartbeatRequest({ openPosts: 0 }, { authorization: `Bearer ${SECRET}` })
      )

      expect(mockRecordCronRun).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, reason: undefined })
      )
    })

    it('records ready: false as a failed run', async () => {
      await postHeartbeat(heartbeatRequest({ ready: false }, { authorization: `Bearer ${SECRET}` }))

      expect(mockRecordCronRun).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, reason: 'gateway_not_ready' })
      )
    })

    it('rejects unknown fields instead of storing them', async () => {
      const response = await postHeartbeat(
        heartbeatRequest({ token: 'should-never-be-here' }, { authorization: `Bearer ${SECRET}` })
      )

      expect(response.status).toBe(400)
      expect(mockRecordCronRun).not.toHaveBeenCalled()
    })
  })
})
