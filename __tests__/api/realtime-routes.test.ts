/**
 * @jest-environment node
 */

/**
 * The two routes signed realtime adds (GHSA-g868-9224-wr3p): the public key
 * clients verify broadcasts with, and the per-user topic name only its owner
 * is given (audit S3-05).
 */

import { NextRequest } from 'next/server'
import { GET as getKey } from '@/app/api/realtime/key/route'
import { GET as getUserTopic } from '@/app/api/realtime/user-topic/route'
import { getRequestAuthUser } from '@/lib/request-auth'
import { __resetRealtimeSigningForTests, buildUserTopic, getRealtimeVerifyKey } from '@/lib/server/realtime-signing'

jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))

const mockAuth = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const originalEnv = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXTAUTH_SECRET = 'test-realtime-signing-secret-routes-00000000'
  delete process.env.REALTIME_SIGNING_SECRET
  __resetRealtimeSigningForTests()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('GET /api/realtime/key', () => {
  it('serves the public half of the key with the server clock, uncached', async () => {
    const before = Date.now()
    const res = await getKey()
    const body = await res.json()

    const key = getRealtimeVerifyKey()!
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({ kid: key.kid, jwk: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, serverTime: expect.any(Number) })
    expect(body.serverTime).toBeGreaterThanOrEqual(before)
    // Never the private scalar.
    expect(JSON.stringify(body)).not.toContain('"d"')
  })

  it('answers 503 when there is no secret to derive a key from', async () => {
    delete process.env.NEXTAUTH_SECRET
    __resetRealtimeSigningForTests()
    expect((await getKey()).status).toBe(503)
  })
})

describe('GET /api/realtime/user-topic', () => {
  const request = () => new NextRequest('http://localhost:3000/api/realtime/user-topic')

  it('gives the caller their own topic and nobody else\'s', async () => {
    mockAuth.mockResolvedValue({ id: 'user-1', username: 'Ann', isGuest: false })
    const res = await getUserTopic(request())

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ topic: buildUserTopic('user-1') })
  })

  it('refuses a caller who is not signed in', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await getUserTopic(request())).status).toBe(401)
  })
})
