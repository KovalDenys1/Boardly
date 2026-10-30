/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - the route modules' Prisma and session mocks are partial

import { NextRequest, NextResponse } from 'next/server'
import { GET as getFriendRequests, POST as postFriendRequest } from '@/app/api/friends/request/route'
import { GET as listLobbies, POST as createLobby } from '@/app/api/lobby/route'
import { requireSessionUser } from '@/lib/session-user'
import { getRequestAuthUser } from '@/lib/request-auth'
import { __rateLimitTestUtils } from '@/lib/rate-limit'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    users: { findUnique: jest.fn(async () => null) },
  },
}))
jest.mock('@/lib/session-user', () => ({ requireSessionUser: jest.fn() }))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/lobby-health', () => ({ sweepStaleLobbiesIfDue: jest.fn(async () => undefined) }))
jest.mock('@/lib/server-operational-events', () => ({ recordServerReliabilityEvent: jest.fn(async () => undefined) }))
jest.mock('@/lib/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), logger: log }
})

const STORE_ENV = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']
const savedStoreEnv = Object.fromEntries(STORE_ENV.map((name) => [name, process.env[name]]))

function call(path: string, method: 'GET' | 'POST') {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { 'x-real-ip': '198.51.100.40', origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
  })
}

describe('two limiters on one route, with no shared store', () => {
  beforeAll(() => {
    for (const name of STORE_ENV) delete process.env[name]
    __rateLimitTestUtils.resetSharedClient()
  })
  beforeEach(() => {
    __rateLimitTestUtils.clearInMemoryStore()
    ;(requireSessionUser as jest.Mock).mockResolvedValue({
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'guest-1', username: 'G', isGuest: true })
  })
  afterAll(() => {
    for (const name of STORE_ENV) {
      if (savedStoreEnv[name] === undefined) delete process.env[name]
      else process.env[name] = savedStoreEnv[name]
    }
    __rateLimitTestUtils.clearInMemoryStore()
    __rateLimitTestUtils.resetSharedClient()
  })

  it('leaves the next friend request allowed after seven page loads read the list', async () => {
    expect((await postFriendRequest(call('/api/friends/request', 'POST'))).status).not.toBe(429)
    for (let i = 0; i < 14; i += 1) {
      expect((await getFriendRequests(call('/api/friends/request?type=received', 'GET'))).status).not.toBe(429)
    }

    expect((await postFriendRequest(call('/api/friends/request', 'POST'))).status).not.toBe(429)
  })

  it('leaves lobby creation allowed after the lobby list is read', async () => {
    expect((await createLobby(call('/api/lobby', 'POST'))).status).not.toBe(429)
    for (let i = 0; i < 14; i += 1) {
      expect((await listLobbies(call('/api/lobby', 'GET'))).status).not.toBe(429)
    }

    expect((await createLobby(call('/api/lobby', 'POST'))).status).not.toBe(429)
  })
})
