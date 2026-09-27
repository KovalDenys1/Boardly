/**
 * @jest-environment node
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import * as nextAuthModule from 'next-auth'
import { POST as startLink } from '@/app/api/discord/link/route'
import { GET as authGet } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/db'
import { claimOnce } from '@/lib/webhook-dedupe'
import {
  createDiscordLinkStart,
  DISCORD_FETCH_TIMEOUT_MS,
  DISCORD_LINK_COOKIE,
  DISCORD_LINK_TTL_SECONDS,
} from '@/lib/discord/account-link'
import { RECENT_SIGN_IN_WINDOW_MS } from '@/lib/auth-session-policy'

/**
 * #1218: /discord/link used to call signIn('discord'), so next-auth's OAuth callback did the
 * linking and issued a new session - for a brand-new user when the session cookie had lapsed
 * on the way. The link is now server-side: the start requires the session and signs a state
 * bound to its user id, and the callback links to that user only, through the adapter, and
 * never writes a session cookie.
 */

jest.mock('next-auth', () => {
  const handler = jest.fn(async () => new Response('next-auth', { status: 200 }))
  return {
    __esModule: true,
    default: jest.fn(() => handler),
    getServerSession: jest.fn(),
    __nextAuthHandler: handler,
  }
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

const mockGetServerSession = nextAuthModule.getServerSession as jest.Mock
const mockNextAuthHandler = nextAuthModule.__nextAuthHandler as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockClaimOnce = claimOnce as jest.Mock

const ORIGIN = 'http://localhost:3000'
const REDIRECT_URI = `${ORIGIN}/api/auth/callback/discord`
const SESSION_COOKIE = 'next-auth.session-token=session-of-user-a'

// A sign-in a minute ago unless a test says otherwise: the start asks for one within ten.
function signedInAs(
  userId: string | null,
  extra: { authenticatedAt?: number | null; suspended?: boolean } = {}
) {
  const { authenticatedAt = Date.now() - 60 * 1000, suspended = false } = extra
  mockGetServerSession.mockResolvedValue(
    userId ? { user: { id: userId, email: `${userId}@boardly.test`, suspended, authenticatedAt } } : null
  )
}

async function start() {
  const res = await startLink(new NextRequest(`${ORIGIN}/api/discord/link`, { method: 'POST' }))
  expect(res.status).toBe(200)
  const { url } = await res.json()
  const cookie = res.cookies.get(DISCORD_LINK_COOKIE)?.value
  expect(cookie).toBeTruthy()
  const state = new URL(url).searchParams.get('state')
  return { url, cookie, state, res }
}

function callback(query: string, cookie: string | undefined) {
  const cookies = [SESSION_COOKIE, cookie ? `${DISCORD_LINK_COOKIE}=${cookie}` : null].filter(Boolean).join('; ')
  const request = new NextRequest(`${ORIGIN}/api/auth/callback/discord?${query}`, {
    headers: { cookie: cookies },
  })
  return authGet(request, { params: Promise.resolve({ nextauth: ['callback', 'discord'] }) })
}

function discordAnswers(discordUser: Record<string, unknown>) {
  global.fetch = jest.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === 'https://discord.com/api/oauth2/token') {
      return new Response(
        JSON.stringify({
          access_token: 'discord-access',
          refresh_token: 'discord-refresh',
          expires_in: 604800,
          token_type: 'Bearer',
          scope: 'identify role_connections.write',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    if (url === 'https://discord.com/api/v10/users/@me') {
      return new Response(JSON.stringify(discordUser), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`)
  }) as unknown as typeof fetch
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie()
}

describe('Discord Linked Roles linking is server-side and keeps the session (#1218)', () => {
  const env = { ...process.env }
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-for-discord-link'
    process.env.NEXTAUTH_URL = ORIGIN
    process.env.DISCORD_CLIENT_ID = 'discord-client'
    process.env.DISCORD_CLIENT_SECRET = 'discord-secret'
    delete process.env.DISCORD_APPLICATION_ID
    signedInAs('user-a')
    mockPrisma.users.findUnique.mockResolvedValue({ suspended: false })
    mockPrisma.accounts.findUnique.mockResolvedValue(null)
    mockPrisma.accounts.findFirst.mockResolvedValue(null)
    mockPrisma.accounts.create.mockResolvedValue({})
    mockPrisma.accounts.update.mockResolvedValue({})
    mockClaimOnce.mockResolvedValue('claimed')
    // The Discord account's address is not the Boardly account's, the case that used to
    // create a new user.
    discordAnswers({ id: 'discord-999', email: 'someone.else@example.net', verified: true })
  })

  afterAll(() => {
    process.env = env
    global.fetch = originalFetch
  })

  it('links a Discord account with a different email to the signed-in user and leaves the session alone', async () => {
    const { url, cookie, state } = await start()

    const authorize = new URL(url)
    expect(authorize.origin + authorize.pathname).toBe('https://discord.com/oauth2/authorize')
    expect(authorize.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(authorize.searchParams.get('scope')).toBe('identify role_connections.write')
    expect(state).toMatch(/^bdlink\./)

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linked=1`)

    // The row lands on the original user id, through the adapter.
    expect(mockPrisma.accounts.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.accounts.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-a',
        type: 'oauth',
        provider: 'discord',
        providerAccountId: 'discord-999',
        access_token: 'discord-access',
        refresh_token: 'discord-refresh',
        scope: 'identify role_connections.write',
      }),
    })
    // No new account, and next-auth never saw the callback, so it issued no session.
    expect(mockPrisma.users.create).not.toHaveBeenCalled()
    expect(mockNextAuthHandler).not.toHaveBeenCalled()
    const cookies = setCookies(res)
    expect(cookies.some((c) => /session-token/.test(c))).toBe(false)
    expect(cookies.some((c) => c.startsWith(`${DISCORD_LINK_COOKIE}=;`) && /Max-Age=0/i.test(c))).toBe(true)

    // The token exchange sent the same redirect URI the authorize request did.
    const tokenCall = (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).endsWith('/oauth2/token'))
    expect(new URLSearchParams(tokenCall[1].body).get('redirect_uri')).toBe(REDIRECT_URI)
    expect(mockClaimOnce).toHaveBeenCalledWith(`discord-link:${state.slice('bdlink.'.length)}`, expect.any(Number), expect.any(String))
  })

  it('links nothing and creates nothing when the session lapsed on the way', async () => {
    const { cookie, state } = await start()
    signedInAs(null)

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=expired`)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    expect(mockPrisma.users.create).not.toHaveBeenCalled()
    expect(mockNextAuthHandler).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(setCookies(res).some((c) => /session-token/.test(c))).toBe(false)
  })

  it('links nothing when the browser is now signed in as someone else', async () => {
    const { cookie, state } = await start()
    signedInAs('user-b')

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=expired`)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('refuses a state that is not the one this browser started', async () => {
    const { cookie } = await start()
    const { state: otherState } = await start()

    const res = await callback(`code=discord-code&state=${encodeURIComponent(otherState)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=expired`)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
  })

  it('refuses a cookie whose signature does not verify, such as one naming another user', async () => {
    const { cookie, state } = await start()
    const [body, signature] = cookie.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, u: 'user-b' })).toString('base64url')
    signedInAs('user-b')

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, `${forgedBody}.${signature}`)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=expired`)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
  })

  it('refuses the same state twice', async () => {
    const { cookie, state } = await start()
    mockClaimOnce.mockResolvedValue('duplicate')

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=expired`)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('leaves a Discord account that belongs to another Boardly account where it is', async () => {
    const { cookie, state } = await start()
    mockPrisma.accounts.findUnique.mockResolvedValue({ id: 'acc-b', userId: 'user-b' })

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=taken`)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    expect(mockPrisma.accounts.update).not.toHaveBeenCalled()
  })

  it('refuses a second Discord account on a Boardly account that already has one', async () => {
    const { cookie, state } = await start()
    mockPrisma.accounts.findFirst.mockResolvedValue({ id: 'acc-a-old' })

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=otherDiscord`)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
  })

  it('re-linking the same Discord account refreshes its tokens on the same row', async () => {
    const { cookie, state } = await start()
    mockPrisma.accounts.findUnique.mockResolvedValue({ id: 'acc-a', userId: 'user-a' })

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linked=1`)
    expect(mockPrisma.accounts.update).toHaveBeenCalledWith({
      where: { id: 'acc-a' },
      data: expect.objectContaining({ access_token: 'discord-access', scope: 'identify role_connections.write' }),
    })
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
  })

  it('a Cancel on Discord\'s page changes nothing', async () => {
    const { cookie, state } = await start()

    const res = await callback(`error=access_denied&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=denied`)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
  })

  it('the start requires a session', async () => {
    signedInAs(null)
    const res = await startLink(new NextRequest(`${ORIGIN}/api/discord/link`, { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(res.cookies.get(DISCORD_LINK_COOKIE)).toBeUndefined()
  })

  // The same ten minutes an email change without a password asks for (#1136): a Discord
  // account linked here becomes a way to sign in, so a session cookie alone must not add one.
  it.each([
    ['signed in eleven minutes ago', () => Date.now() - RECENT_SIGN_IN_WINDOW_MS - 60 * 1000],
    ['a token from before the claim existed', () => null],
  ])('the start asks for a recent sign-in: %s', async (_label, authenticatedAt) => {
    signedInAs('user-a', { authenticatedAt: authenticatedAt() })

    const res = await startLink(new NextRequest(`${ORIGIN}/api/discord/link`, { method: 'POST' }))

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('RECENT_SIGN_IN_REQUIRED')
    expect(res.cookies.get(DISCORD_LINK_COOKIE)).toBeUndefined()
  })

  it('a sign-in just inside the window may start', async () => {
    signedInAs('user-a', { authenticatedAt: Date.now() - RECENT_SIGN_IN_WINDOW_MS + 5_000 })
    await start()
  })

  it('links nothing when the link cookie is missing', async () => {
    const { state } = await start()

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, undefined)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=expired`)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    expect(mockNextAuthHandler).not.toHaveBeenCalled()
  })

  it('links nothing with a cookie past its expiry', async () => {
    const issuedLongAgo = Date.now() - (DISCORD_LINK_TTL_SECONDS + 60) * 1000
    const { cookieValue, state } = createDiscordLinkStart({
      userId: 'user-a',
      redirectUri: REDIRECT_URI,
      clientId: 'discord-client',
      now: issuedLongAgo,
    })

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookieValue)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=expired`)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
  })

  it.each([
    ['the token already says so', true],
    ['only the database knows so far', false],
  ])('a suspended account at the callback goes to /suspended and links nothing: %s', async (_label, tokenSuspended) => {
    const { cookie, state } = await start()
    signedInAs('user-a', { suspended: tokenSuspended })
    mockPrisma.users.findUnique.mockResolvedValue({ suspended: true })

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/suspended`)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    expect(setCookies(res).some((c) => c.startsWith(`${DISCORD_LINK_COOKIE}=;`) && /Max-Age=0/i.test(c))).toBe(true)
  })

  it('without Redis the single-use claim fails open, as every Redis-backed check does, and the link still happens', async () => {
    const { cookie, state } = await start()
    mockClaimOnce.mockResolvedValue('unavailable')

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linked=1`)
    expect(mockPrisma.accounts.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-a', providerAccountId: 'discord-999' }),
    })
  })

  it('a failed token exchange answers as a failed link', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    ) as unknown as typeof fetch
    const { cookie, state } = await start()

    const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

    expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=failed`)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    expect(mockPrisma.accounts.update).not.toHaveBeenCalled()
  })

  it('a Discord call that hangs is cut off by the timeout and answers as a failed link', async () => {
    const timer = new AbortController()
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timer.signal)
    // Hangs until its signal fires, which here is "the five seconds are up".
    global.fetch = jest.fn(
      (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
          queueMicrotask(() => timer.abort(new DOMException('The operation timed out.', 'TimeoutError')))
        })
    ) as unknown as typeof fetch
    try {
      const { cookie, state } = await start()

      const res = await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

      expect(timeoutSpy).toHaveBeenCalledWith(DISCORD_FETCH_TIMEOUT_MS)
      expect((global.fetch as jest.Mock).mock.calls[0][1].signal).toBe(timer.signal)
      expect(res.headers.get('location')).toBe(`${ORIGIN}/discord/link?linkError=failed`)
      expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
    } finally {
      timeoutSpy.mockRestore()
    }
  })

  it('both Discord calls carry a timeout', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout')
    try {
      const { cookie, state } = await start()
      await callback(`code=discord-code&state=${encodeURIComponent(state)}`, cookie)

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls).toHaveLength(2)
      for (const [, init] of calls) expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(timeoutSpy.mock.calls.filter(([ms]) => ms === DISCORD_FETCH_TIMEOUT_MS)).toHaveLength(2)
    } finally {
      timeoutSpy.mockRestore()
    }
  })

  it('a Discord sign-in callback without the link prefix is still next-auth\'s', async () => {
    const res = await callback('code=discord-code&state=abcDEF123_-', undefined)

    expect(mockNextAuthHandler).toHaveBeenCalledTimes(1)
    expect(await res.text()).toBe('next-auth')
    expect(mockPrisma.accounts.create).not.toHaveBeenCalled()
  })

  it('the page no longer hands the link to next-auth', () => {
    const page = readFileSync(path.join(process.cwd(), 'app/discord/link/page.tsx'), 'utf8')
    // Comments may still name the old call; code may not.
    const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bsignIn\b/)
    expect(page).toMatch(/fetch\('\/api\/discord\/link', \{ method: 'POST' \}\)/)
  })
})
