/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - the database stand-in answers every query with nothing

import path from 'node:path'
import { NextRequest } from 'next/server'
import { __rateLimitTestUtils } from '@/lib/rate-limit'

/**
 * Ordinary play from people who share one address - a family on a home network, a
 * classroom - driven through the real handlers and the real limiter at the rates the
 * client sends: a 2s waiting-room sync, a 10s heartbeat, a chat read per message for every
 * member, a spectator read per move. None of it may be refused (#1607).
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
    const id = request.headers.get('x-test-user')
    return id ? { id, username: id, isGuest: true } : null
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

const ROOT = path.join(process.cwd(), 'app/api/lobby/[code]')
const route = (segment: string) => require(path.join(ROOT, segment, 'route.ts'))

const ROUTES = {
  'lobby read': { handler: route('.').GET, method: 'GET', suffix: '' },
  'realtime topic': { handler: route('realtime-topic').GET, method: 'GET', suffix: '/realtime-topic' },
  'chat history': { handler: route('chat').GET, method: 'GET', suffix: '/chat' },
  heartbeat: { handler: route('heartbeat').POST, method: 'POST', suffix: '/heartbeat' },
  leave: { handler: route('leave').POST, method: 'POST', suffix: '/leave' },
  spectate: { handler: route('spectate').GET, method: 'GET', suffix: '/spectate' },
  rematch: { handler: route('rematch').POST, method: 'POST', suffix: '/rematch' },
  'add bot': { handler: route('add-bot').POST, method: 'POST', suffix: '/add-bot' },
  'bot difficulty': { handler: route('bot-difficulty').PATCH, method: 'PATCH', suffix: '/bot-difficulty' },
} as const
type RouteName = keyof typeof ROUTES

const ADDRESS = '203.0.113.9'

/** Sends one request and returns, per route, how many were refused so far. */
function network() {
  const refused: Partial<Record<RouteName, number>> = {}
  const send = async (name: RouteName, code: string, user: string) => {
    const { handler, method, suffix } = ROUTES[name]
    const request = new NextRequest(`http://localhost:3000/api/lobby/${code}${suffix}`, {
      method,
      headers: { 'x-real-ip': ADDRESS, origin: 'http://localhost:3000', 'content-type': 'application/json', 'x-test-user': user },
      ...(method === 'GET' ? {} : { body: '{}' }),
    })
    let status = 0
    try {
      status = (await handler(request, { params: Promise.resolve({ code }) })).status
    } catch {
      // A handler that trips over the empty database was still let through.
    }
    if (status === 429) refused[name] = (refused[name] ?? 0) + 1
  }
  return { refused, send }
}

/** One minute of a table: everyone opens it, syncs, pings, reads each chat message, and leaves. */
async function playOneMinute(
  send: ReturnType<typeof network>['send'],
  seats: Array<{ user: string; code: string }>,
  { chatMessages }: { chatMessages: number }
) {
  for (const { user, code } of seats) {
    await send('realtime topic', code, user)
  }
  for (let second = 0; second < 60; second += 2) {
    for (const { user, code } of seats) await send('lobby read', code, user)
    if (second % 10 === 0) for (const { user, code } of seats) await send('heartbeat', code, user)
  }
  for (const { user, code } of seats) {
    await send('realtime topic', code, user)
  }
  for (let message = 0; message < chatMessages; message += 1) {
    for (const { user, code } of seats) await send('chat history', code, user)
  }
  for (const { user, code } of seats) {
    await send('leave', code, user)
  }
}

describe('ordinary play behind one address is never refused', () => {
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

  it('a family of four at one table on one home network', async () => {
    const { refused, send } = network()
    const seats = ['mum', 'dad', 'kid-1', 'kid-2'].map((user) => ({ user, code: '1000' }))
    await playOneMinute(send, seats, { chatMessages: 10 })
    expect(refused).toEqual({})
  })

  it('one player with the table open in two tabs', async () => {
    const { refused, send } = network()
    const tab = { user: 'solo', code: '1000' }
    await playOneMinute(send, [tab, tab], { chatMessages: 10 })
    expect(refused).toEqual({})
  })

  it('a classroom of 30 starting games at 8 tables in the same minute', async () => {
    const { refused, send } = network()
    const seats = Array.from({ length: 30 }, (_, seat) => ({ user: `pupil-${seat}`, code: String(1000 + (seat % 8)) }))
    await playOneMinute(send, seats, { chatMessages: 3 })
    expect(refused).toEqual({})
  })

  it('two spectators at each of three tables, following every move for a minute', async () => {
    const { refused, send } = network()
    // Opening the page, two 30s polls, and a re-read on each of 11 moves.
    for (let read = 0; read < 14; read += 1) {
      for (let table = 0; table < 3; table += 1) {
        for (let viewer = 0; viewer < 2; viewer += 1) {
          await send('spectate', String(1000 + table), `viewer-${table}-${viewer}`)
        }
      }
    }
    expect(refused).toEqual({})
  })

  it('two tables on one network asking for six rematches each in an hour', async () => {
    const { refused, send } = network()
    for (let table = 0; table < 2; table += 1) {
      for (let press = 0; press < 6; press += 1) await send('rematch', String(1000 + table), `host-${table}`)
    }
    expect(refused).toEqual({})
  })

  it('a host adding three bots and setting their difficulty', async () => {
    const { refused, send } = network()
    for (let bot = 0; bot < 3; bot += 1) {
      await send('add bot', '1000', 'host')
      await send('bot difficulty', '1000', 'host')
    }
    expect(refused).toEqual({})
  })
})
