// @ts-nocheck

import {
  buildRoleConnectionMetadata,
  clearRoleConnection,
  hasRoleConnectionScope,
  pushRoleConnection,
  syncAllRoleConnections,
} from '@/lib/discord/role-connection'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    accounts: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
    },
    players: {
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

const APPLICATION_ID = 'app-123'
const ROLE_CONNECTION_URL = `https://discord.com/api/v10/users/@me/applications/${APPLICATION_ID}/role-connection`
const TOKEN_URL = 'https://discord.com/api/oauth2/token'

const NOW = new Date('2026-09-15T12:00:00.000Z')
const nowSeconds = Math.floor(NOW.getTime() / 1000)

function jsonResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function freshAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    userId: 'user-1',
    access_token: 'access-fresh',
    refresh_token: 'refresh-1',
    expires_at: nowSeconds + 6 * 24 * 60 * 60,
    scope: 'identify email role_connections.write',
    ...overrides,
  }
}

const premiumUser = {
  username: 'denys',
  premiumUntil: new Date('2026-12-01T00:00:00.000Z'),
  emailVerified: new Date('2026-01-02T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
}

let fetchMock: jest.Mock

function fetchCall(index: number): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[index]
  return { url, init }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  process.env.DISCORD_CLIENT_ID = 'client-id'
  process.env.DISCORD_CLIENT_SECRET = 'client-secret'
  process.env.DISCORD_APPLICATION_ID = APPLICATION_ID
  fetchMock = jest.fn()
  global.fetch = fetchMock

  mockPrisma.accounts.update.mockResolvedValue({})
  mockPrisma.users.findUnique.mockResolvedValue(premiumUser)
  mockPrisma.players.count.mockResolvedValue(27)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('hasRoleConnectionScope', () => {
  it('recognises the scope anywhere in the space-separated list', () => {
    expect(hasRoleConnectionScope('identify email role_connections.write')).toBe(true)
    expect(hasRoleConnectionScope('role_connections.write')).toBe(true)
  })

  it('rejects the legacy scope, a partial match and empty values', () => {
    expect(hasRoleConnectionScope('identify email')).toBe(false)
    expect(hasRoleConnectionScope('role_connections')).toBe(false)
    expect(hasRoleConnectionScope(null)).toBe(false)
    expect(hasRoleConnectionScope('')).toBe(false)
  })
})

describe('buildRoleConnectionMetadata', () => {
  it('encodes every value as a string in the shape Discord expects', () => {
    expect(
      buildRoleConnectionMetadata({
        premiumUntil: new Date(NOW.getTime() + 1000),
        emailVerified: null,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        gamesPlayed: 3,
      })
    ).toEqual({
      premium: '1',
      games_played: '3',
      member_since: '2026-01-01T10:00:00.000Z',
      verified: '0',
    })
  })

  it('treats an expired premiumUntil as not premium', () => {
    const metadata = buildRoleConnectionMetadata({
      premiumUntil: new Date(NOW.getTime() - 1000),
      emailVerified: new Date(),
      createdAt: NOW,
      gamesPlayed: 0,
    })
    expect(metadata.premium).toBe('0')
    expect(metadata.verified).toBe('1')
    expect(metadata.games_played).toBe('0')
  })
})

describe('pushRoleConnection', () => {
  it('PUTs the role connection with the four metadata fields using the stored token', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(freshAccount())
    fetchMock.mockResolvedValueOnce(jsonResponse(200))

    const result = await pushRoleConnection('user-1')

    expect(result).toEqual({
      status: 'pushed',
      metadata: {
        premium: '1',
        games_played: '27',
        member_since: '2026-01-01T10:00:00.000Z',
        verified: '1',
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init } = fetchCall(0)
    expect(url).toBe(ROLE_CONNECTION_URL)
    expect(init.method).toBe('PUT')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer access-fresh',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body as string)).toEqual({
      platform_name: 'Boardly',
      platform_username: 'denys',
      metadata: {
        premium: '1',
        games_played: '27',
        member_since: '2026-01-01T10:00:00.000Z',
        verified: '1',
      },
    })

    // Same "games played" definition as the profile: finished games the user sat in.
    expect(mockPrisma.players.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', game: { status: 'finished' } },
    })
    // No refresh happened: the token had six days left.
    expect(mockPrisma.accounts.update).not.toHaveBeenCalled()
  })

  it('refreshes an expiring token first, writes it back, then pushes with the new one', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(
      freshAccount({ access_token: 'access-old', expires_at: nowSeconds + 30 })
    )
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'access-new',
          refresh_token: 'refresh-new',
          expires_in: 604800,
          scope: 'identify email role_connections.write',
        })
      )
      .mockResolvedValueOnce(jsonResponse(200))

    const result = await pushRoleConnection('user-1')
    expect(result.status).toBe('pushed')

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const refresh = fetchCall(0)
    expect(refresh.url).toBe(TOKEN_URL)
    expect(refresh.init.method).toBe('POST')
    expect(refresh.init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    })
    expect(new URLSearchParams(refresh.init.body as string).get('grant_type')).toBe('refresh_token')
    expect(new URLSearchParams(refresh.init.body as string).get('refresh_token')).toBe('refresh-1')

    expect(mockPrisma.accounts.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        expires_at: nowSeconds + 604800,
        scope: 'identify email role_connections.write',
      },
    })

    const push = fetchCall(1)
    expect(push.url).toBe(ROLE_CONNECTION_URL)
    expect(push.init.headers).toMatchObject({ Authorization: 'Bearer access-new' })
  })

  it('skips a row whose scope lacks role_connections.write without calling Discord', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(freshAccount({ scope: 'identify email' }))

    const result = await pushRoleConnection('user-1')

    expect(result).toEqual({ status: 'skipped', reason: 'legacy_scope' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled()
  })

  it('skips silently when the user has no Discord row', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(null)

    const result = await pushRoleConnection('user-1')

    expect(result).toEqual({ status: 'skipped', reason: 'no_discord_account' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops the tokens after a revoked grant instead of retrying, so the next run skips the row', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(freshAccount())
    // First PUT: 401. One refresh is allowed, and Discord rejects it as invalid_grant.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(400, { error: 'invalid_grant' }))

    const result = await pushRoleConnection('user-1')

    expect(result).toEqual({ status: 'revoked' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockPrisma.accounts.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { access_token: null, refresh_token: null, expires_at: null },
    })

    // Next time: no token left, so no Discord call at all.
    mockPrisma.accounts.findFirst.mockResolvedValue(
      freshAccount({ access_token: null, refresh_token: null, expires_at: null })
    )
    fetchMock.mockClear()
    expect(await pushRoleConnection('user-1')).toEqual({ status: 'skipped', reason: 'no_token' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns failed instead of throwing on a Discord 5xx', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(freshAccount())
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { message: 'bad gateway' }))

    const result = await pushRoleConnection('user-1')

    expect(result.status).toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockPrisma.accounts.update).not.toHaveBeenCalled()
  })
})

describe('clearRoleConnection', () => {
  it('PUTs empty metadata so every linked role falls away before the row is deleted', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(freshAccount())
    fetchMock.mockResolvedValueOnce(jsonResponse(200))

    const result = await clearRoleConnection('user-1')

    expect(result).toEqual({ status: 'cleared' })
    const { url, init } = fetchCall(0)
    expect(url).toBe(ROLE_CONNECTION_URL)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ platform_name: 'Boardly', metadata: {} })
    // Clearing needs no user lookup.
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled()
  })

  it('skips a legacy-scope row: nothing was ever written for it, and the token could not clear it anyway', async () => {
    mockPrisma.accounts.findFirst.mockResolvedValue(freshAccount({ scope: 'identify email' }))

    expect(await clearRoleConnection('user-1')).toEqual({ status: 'skipped', reason: 'legacy_scope' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('syncAllRoleConnections', () => {
  it('walks rows in batches, only those with the scope and a token, and counts outcomes', async () => {
    mockPrisma.accounts.findMany
      .mockResolvedValueOnce([
        { id: 'acc-1', userId: 'user-1' },
        { id: 'acc-2', userId: 'user-2' },
      ])
      .mockResolvedValueOnce([{ id: 'acc-3', userId: 'user-3' }])

    mockPrisma.accounts.findFirst.mockImplementation(async ({ where }) => {
      if (where.userId === 'user-2') return freshAccount({ id: 'acc-2', userId: 'user-2', scope: 'identify email' })
      return freshAccount({ id: `acc-${where.userId.slice(-1)}`, userId: where.userId })
    })
    fetchMock.mockResolvedValue(jsonResponse(200))

    const summary = await syncAllRoleConnections({ batchSize: 2, deadlineMs: 10_000 })

    expect(summary).toEqual({ scanned: 3, pushed: 2, skipped: 1, revoked: 0, failed: 0, stoppedEarly: false })

    const firstQuery = mockPrisma.accounts.findMany.mock.calls[0][0]
    expect(firstQuery.where).toEqual({
      provider: 'discord',
      scope: { contains: 'role_connections.write' },
      OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }],
    })
    expect(firstQuery.take).toBe(2)
    expect(firstQuery.cursor).toBeUndefined()

    const secondQuery = mockPrisma.accounts.findMany.mock.calls[1][0]
    expect(secondQuery.cursor).toEqual({ id: 'acc-2' })
    expect(secondQuery.skip).toBe(1)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
