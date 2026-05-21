/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { proxy } from '@/proxy'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>
const originalCronSecret = process.env.CRON_SECRET

describe('proxy CSRF enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as any)
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  afterAll(() => {
    process.env.CRON_SECRET = originalCronSecret
  })

  it('allows same-origin authenticated unsafe API requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'next-auth.session-token=test-session',
      },
    })

    const response = await proxy(request)

    expect(response.status).not.toBe(403)
  })

  it('rejects cross-origin authenticated unsafe API requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        cookie: 'next-auth.session-token=test-session',
      },
    })

    const response = await proxy(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe('Invalid origin. Possible CSRF attack.')
  })

  it('rejects cross-origin unsafe API requests without trusted server credentials', async () => {
    const request = new NextRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
      },
    })

    const response = await proxy(request)

    expect(response.status).toBe(403)
  })

  it('allows cross-origin internal requests with valid internal secret header', async () => {
    const originalSecret = process.env.BOARDLY_INTERNAL_SECRET
    process.env.BOARDLY_INTERNAL_SECRET = 'test-internal-secret'
    const request = new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'X-Internal-Secret': 'test-internal-secret',
      },
    })

    const response = await proxy(request)

    process.env.BOARDLY_INTERNAL_SECRET = originalSecret
    expect(response.status).not.toBe(403)
  })

  it('allows machine requests with valid cron bearer token even without origin header', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/maintenance', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-cron-secret',
      },
    })

    const response = await proxy(request)

    expect(response.status).not.toBe(403)
  })
})
