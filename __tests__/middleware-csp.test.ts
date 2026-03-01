/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { middleware } from '@/middleware'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

jest.mock('@/lib/csrf', () => ({
  getSecurityHeaders: jest.fn(() => ({
    'X-Frame-Options': 'DENY',
  })),
}))

jest.mock('@/lib/socket-url', () => ({
  getServerSocketUrl: jest.fn(() => 'http://localhost:3001'),
}))

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>

describe('middleware CSP policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as any)
  })

  it('uses nonce-based script-src policy without unsafe directives in non-development environments', async () => {
    const request = new NextRequest('http://localhost:3000/games', {
      method: 'GET',
    })

    const response = await middleware(request)
    const csp = response.headers.get('Content-Security-Policy')
    const scriptSrcDirective = csp
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src'))

    expect(csp).toBeTruthy()
    expect(csp).toContain('script-src')
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).toMatch(/'nonce-[^']+'/)
    expect(scriptSrcDirective).toBeTruthy()
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'")
    expect(scriptSrcDirective).not.toContain("'unsafe-eval'")
  })
})
