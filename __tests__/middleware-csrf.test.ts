/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { middleware } from '@/middleware'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  getServerSocketUrl: jest.fn(() => 'http://localhost:3001'),
}))

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>

describe('middleware CSRF enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as any)
  })

  it('allows same-origin authenticated unsafe API requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'next-auth.session-token=test-session',
      },
    })

    const response = await middleware(request)

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

    const response = await middleware(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe('Invalid origin. Possible CSRF attack.')
  })

  it('does not enforce CSRF when no authenticated session cookie is present', async () => {
    const request = new NextRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
      },
    })

    const response = await middleware(request)

    expect(response.status).not.toBe(403)
  })
})
