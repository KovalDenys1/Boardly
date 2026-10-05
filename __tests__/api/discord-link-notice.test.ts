/**
 * @jest-environment node
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import * as nextAuthModule from 'next-auth'
import { POST as startLink } from '@/app/api/discord/link/route'
import { GET as authGet } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/db'
import { sendProviderLinkedNoticeEmail } from '@/lib/email'
import { claimOnce } from '@/lib/webhook-dedupe'
import { DISCORD_LINK_COOKIE } from '@/lib/discord/account-link'

/**
 * #1223: the account's owner is emailed when /discord/link puts a Discord account on it,
 * and only then. The harness is the one in discord-link-flow.test.ts.
 */

jest.mock('next-auth', () => {
  const handler = jest.fn(async () => new Response('next-auth', { status: 200 }))
  return { __esModule: true, default: jest.fn(() => handler), getServerSession: jest.fn() }
})
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    accounts: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitPresets: { api: {}, credentialsLogin: {} },
}))
jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  return { apiLogger: () => log, logger: log }
})
jest.mock('@/lib/webhook-dedupe', () => ({ claimOnce: jest.fn() }))
jest.mock('@/lib/email', () => ({ sendProviderLinkedNoticeEmail: jest.fn() }))

const mockGetServerSession = nextAuthModule.getServerSession as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockClaimOnce = claimOnce as jest.Mock
const mockSendNotice = sendProviderLinkedNoticeEmail as jest.Mock

const ORIGIN = 'http://localhost:3000'
const OWNER = { suspended: false, email: 'owner@example.com', username: 'Ola', isGuest: false, bot: null }

async function start() {
  const res = await startLink(new NextRequest(`${ORIGIN}/api/discord/link`, { method: 'POST' }))
  expect(res.status).toBe(200)
  const { url } = await res.json()
  return { cookie: res.cookies.get(DISCORD_LINK_COOKIE)?.value, state: new URL(url).searchParams.get('state') }
}

async function finishLink(query = 'code=discord-code') {
  const { cookie, state } = await start()
  const request = new NextRequest(
    `${ORIGIN}/api/auth/callback/discord?${query}&state=${encodeURIComponent(state)}`,
    { headers: { cookie: `next-auth.session-token=session-of-user-a; ${DISCORD_LINK_COOKIE}=${cookie}` } }
  )
  const res = await authGet(request, { params: Promise.resolve({ nextauth: ['callback', 'discord'] }) })
  return res.headers.get('location')
}

function discordAnswers(tokenStatus = 200) {
  global.fetch = jest.fn(async (input: string | URL) => {
    const body = String(input).endsWith('/oauth2/token')
      ? { access_token: 'discord-access', refresh_token: 'discord-refresh', expires_in: 604800, token_type: 'Bearer', scope: 'identify role_connections.write' }
      : { id: 'discord-999' }
    const status = String(input).endsWith('/oauth2/token') ? tokenStatus : 200
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
}

describe('the owner is emailed when a Discord account is linked (#1223)', () => {
  const env = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-for-discord-link'
    process.env.NEXTAUTH_URL = ORIGIN
    process.env.DISCORD_CLIENT_ID = 'discord-client'
    process.env.DISCORD_CLIENT_SECRET = 'discord-secret'
    delete process.env.DISCORD_APPLICATION_ID
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-a', email: OWNER.email, suspended: false, authenticatedAt: Date.now() - 60 * 1000 },
    })
    mockPrisma.users.findUnique.mockResolvedValue(OWNER)
    mockPrisma.accounts.findUnique.mockResolvedValue(null)
    mockPrisma.accounts.findFirst.mockResolvedValue(null)
    mockPrisma.accounts.create.mockResolvedValue({})
    mockPrisma.accounts.update.mockResolvedValue({})
    mockClaimOnce.mockResolvedValue('claimed')
    mockSendNotice.mockResolvedValue({ success: true })
    discordAnswers()
  })

  afterAll(() => {
    process.env = env
    global.fetch = originalFetch
  })

  it('a new link sends exactly one notice, naming Discord, to the account\'s address', async () => {
    const before = Date.now()

    expect(await finishLink()).toBe(`${ORIGIN}/discord/link?linked=1`)

    expect(mockSendNotice).toHaveBeenCalledTimes(1)
    const [to, details] = mockSendNotice.mock.calls[0]
    expect(to).toBe('owner@example.com')
    expect(details).toEqual({ username: 'Ola', provider: 'discord', linkedAt: expect.any(Date) })
    expect(details.linkedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(details.linkedAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it.each([
    ['the Discord account belongs to another Boardly account', () => mockPrisma.accounts.findUnique.mockResolvedValue({ id: 'acc-b', userId: 'user-b' }), 'code=discord-code', 'taken'],
    ['the Boardly account already has another Discord account', () => mockPrisma.accounts.findFirst.mockResolvedValue({ id: 'acc-a-old' }), 'code=discord-code', 'otherDiscord'],
    ['the token exchange fails', () => discordAnswers(400), 'code=discord-code', 'failed'],
    ['the write fails', () => mockPrisma.accounts.create.mockRejectedValue(new Error('db down')), 'code=discord-code', 'failed'],
    ['the person cancels on Discord\'s page', () => undefined, 'error=access_denied', 'denied'],
  ])('sends no notice when %s', async (_name, arrange, query, linkError) => {
    arrange()

    expect(await finishLink(query)).toBe(`${ORIGIN}/discord/link?linkError=${linkError}`)

    expect(mockSendNotice).not.toHaveBeenCalled()
  })

  it.each([
    ['is refused by the mail provider', () => mockSendNotice.mockResolvedValue({ success: false, error: 'quota' })],
    ['throws', () => mockSendNotice.mockRejectedValue(new Error('network'))],
  ])('a notice that %s leaves the link in place', async (_name, arrange) => {
    arrange()

    expect(await finishLink()).toBe(`${ORIGIN}/discord/link?linked=1`)

    expect(mockSendNotice).toHaveBeenCalledTimes(1)
    expect(mockPrisma.accounts.create).toHaveBeenCalledTimes(1)
  })

  it('re-linking the Discord account that is already on the account sends no notice', async () => {
    mockPrisma.accounts.findUnique.mockResolvedValue({ id: 'acc-a', userId: 'user-a' })

    expect(await finishLink()).toBe(`${ORIGIN}/discord/link?linked=1`)

    expect(mockPrisma.accounts.update).toHaveBeenCalledTimes(1)
    expect(mockSendNotice).not.toHaveBeenCalled()
  })

  it.each([
    ['has no email address', { ...OWNER, email: null }],
    ['is a guest', { ...OWNER, isGuest: true }],
    ['is a bot', { ...OWNER, bot: { id: 'bot-1' } }],
  ])('links without a notice when the account %s', async (_name, user) => {
    mockPrisma.users.findUnique.mockResolvedValue(user)

    expect(await finishLink()).toBe(`${ORIGIN}/discord/link?linked=1`)

    expect(mockPrisma.accounts.create).toHaveBeenCalledTimes(1)
    expect(mockSendNotice).not.toHaveBeenCalled()
  })
})
