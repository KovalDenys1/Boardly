/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - the database stand-in answers every query with nothing

import path from 'node:path'
import { NextRequest } from 'next/server'
import { __rateLimitTestUtils } from '@/lib/rate-limit'

/**
 * Every route under /api/lobby/[code]/ carries a 4-digit code in its path, so a limiter keyed
 * on the path gives each of the 10,000 codes its own allowance (#1607). That is right for the
 * reads and polls, where walking codes gains nothing, and wrong where it does: reopening one
 * closed table after another, leaving or joining as a guest. Those handlers are driven here
 * with the real limiter, from one address and one identity, against a different code on every
 * request: one shared budget means a 429 arrives long before the walk ends.
 */

const anything: unknown = new Proxy(() => undefined, {
  get: (_target, prop) => (prop === 'then' ? undefined : anything),
  apply: () => Promise.resolve(null),
})
const prisma = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === '$transaction') {
        return async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))
      }
      return anything
    },
  }
)

jest.mock('@/lib/db', () => ({ get prisma() { return prisma } }))
jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(async (request: Request) => {
    const id = request.headers.get('x-test-user') ?? 'walker'
    return { id, username: id, isGuest: true }
  }),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn(async () => null) }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(async () => true),
  broadcastToUser: jest.fn(async () => true),
}))
jest.mock('@/lib/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), logger: log }
})

const STORE_ENV = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']
const savedStoreEnv = Object.fromEntries(STORE_ENV.map((name) => [name, process.env[name]]))

const CODE_ROUTES = path.join(process.cwd(), 'app/api/lobby/[code]')
const WALKABLE = ['reopen', 'leave', 'join-guest']
// Above the largest budget any of these routes allows one caller in a window.
const WALK = 650

const handlers = WALKABLE.map((segment) => path.join(CODE_ROUTES, segment, 'route.ts')).flatMap((file) => {
  const relative = path.relative(CODE_ROUTES, path.dirname(file))
  const mod = require(file)
  return ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    .filter((method) => typeof mod[method] === 'function')
    .map((method) => ({ name: `${method} ${relative}`, method, segment: relative, handler: mod[method] }))
})

async function firstRefusal({ method, segment, handler }: (typeof handlers)[number]): Promise<number | null> {
  for (let i = 0; i < WALK; i += 1) {
    const code = String(i).padStart(4, '0')
    const request = new NextRequest(`http://localhost:3000/api/lobby/${code}/${segment}`, {
      method,
      headers: { 'x-real-ip': '203.0.113.9', origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    })
    let status = 0
    try {
      status = (await handler(request, { params: Promise.resolve({ code }) })).status
    } catch {
      // A handler that trips over the empty database still spent its request.
    }
    if (status === 429) return i + 1
  }
  return null
}

describe('limiters on /api/lobby/[code]/ routes', () => {
  beforeAll(() => {
    for (const name of STORE_ENV) delete process.env[name]
    __rateLimitTestUtils.resetSharedClient()
  })
  beforeEach(() => __rateLimitTestUtils.clearInMemoryStore())
  afterAll(() => {
    for (const name of STORE_ENV) {
      if (savedStoreEnv[name] === undefined) delete process.env[name]
      else process.env[name] = savedStoreEnv[name]
    }
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()
  })

  it('finds the routes', () => {
    expect(handlers.map((entry) => entry.name)).toEqual(['POST reopen', 'POST leave', 'POST join-guest'])
  })

  it.each(handlers.map((entry) => [entry.name, entry]))(
    '%s: requests to different codes from one caller share one budget',
    async (_name, entry) => {
      expect(await firstRefusal(entry)).not.toBeNull()
    },
    60_000
  )
})
