/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * #1138: app/api/auth/login/route.ts was a second, session-less password
 * check with no caller anywhere in the app — NextAuth's signIn('credentials')
 * handles the real thing, in app/api/auth/[...nextauth] — but its own
 * rate-limit budget (5/15 min, separate from the real sign-in path's 10/15
 * min) gave an attacker 15 guesses per IP per window against a route that
 * told suspended-vs-invalid apart after a correct password. Deleting the
 * file removes that second password check; it does not make Next.js answer
 * 404 for POST /api/auth/login. The path falls through to the catch-all
 * app/api/auth/[...nextauth]/route.ts, and NextAuth 4.24.15 answers 400
 * ("This action with HTTP POST is not supported") because "login" is not
 * one of its known actions (signin, signout, callback, session, csrf, …).
 * The credentials `authorize()` callback — the one place a password is
 * checked — is never reached, which is the security property this test
 * pins: no user lookup, no password comparison, just a 400.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    accounts: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  comparePassword: jest.fn(),
}))

// The credentials-callback limiter this route also carries (#714) is
// unrelated to this test: /api/auth/login never reaches that branch. Mock it
// anyway so constructing the handler needs no real Redis/env config.
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
  rateLimitPresets: { credentialsLogin: {} },
}))

// next-auth's app-router adapter (next-auth/next) reads the incoming request
// through next/headers' cookies()/headers(), which only resolve inside a real
// Next.js request scope. Outside one — as in this test — they throw
// "cookies was called outside a request scope". Stub both to the empty
// request this route never inspects for the /api/auth/login path anyway.
jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ getAll: () => [] })),
  headers: jest.fn(async () => new Headers()),
}))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/db'
import { comparePassword } from '@/lib/auth'

const mockFindFirst = prisma.users.findFirst as jest.Mock
const mockFindUnique = prisma.users.findUnique as jest.Mock
const mockComparePassword = comparePassword as jest.Mock

function loginRequest(body: unknown = { email: 'user@example.com', password: 'whatever' }) {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('the dead /api/auth/login route (#1138)', () => {
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
  const originalNextAuthUrl = process.env.NEXTAUTH_URL

  beforeEach(() => {
    jest.clearAllMocks()
    // Real deployments always have both set; supplying them here just keeps
    // NextAuth's own "unconfigured" warnings out of the test output.
    process.env.NEXTAUTH_SECRET = 'test-secret'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    if (typeof originalNextAuthSecret === 'string') {
      process.env.NEXTAUTH_SECRET = originalNextAuthSecret
    } else {
      delete process.env.NEXTAUTH_SECRET
    }

    if (typeof originalNextAuthUrl === 'string') {
      process.env.NEXTAUTH_URL = originalNextAuthUrl
    } else {
      delete process.env.NEXTAUTH_URL
    }
  })

  it('has no route.ts left under app/api/auth/login', () => {
    const projectRoot = process.cwd()
    expect(existsSync(path.join(projectRoot, 'app', 'api', 'auth', 'login', 'route.ts'))).toBe(false)
  })

  it('is referenced nowhere in app, components, lib or hooks', () => {
    const projectRoot = process.cwd()
    const roots = ['app', 'components', 'lib', 'hooks'].filter((dir) =>
      existsSync(path.join(projectRoot, dir))
    )
    const hits: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue
        if (readFileSync(full, 'utf8').includes('api/auth/login')) hits.push(path.relative(projectRoot, full))
      }
    }

    for (const root of roots) walk(path.join(projectRoot, root))

    expect(hits).toEqual([])
  })

  it('still falls under the security-headers proxy matcher, like any other API path', () => {
    // Same extraction proxy-matcher.test.ts uses: the matcher is a statically
    // analyzable literal, read out of the source rather than imported.
    const projectRoot = process.cwd()
    const source = readFileSync(path.join(projectRoot, 'proxy.ts'), 'utf8')
    const matcher = source.match(/matcher: \[\n\s*'([^']+)',\n\s*\],/)?.[1]
    expect(matcher).toBeDefined()

    const pattern = new RegExp(`^${(matcher ?? '').replace(/\\\\/g, '\\')}$`)
    expect(pattern.test('/api/auth/login')).toBe(true)
  })

  it('answers 400 from NextAuth\'s own catch-all, never reaching a password check', async () => {
    const response = await POST(loginRequest(), { params: { nextauth: ['login'] } })

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('not supported')

    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(mockComparePassword).not.toHaveBeenCalled()
  })
})
