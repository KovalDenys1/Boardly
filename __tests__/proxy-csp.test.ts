/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { proxy } from '@/proxy'

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

describe('proxy CSP policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as any)
  })

  it('uses production-safe script-src policy compatible with Next.js runtime bootstrap', async () => {
    const request = new NextRequest('http://localhost:3000/games', {
      method: 'GET',
    })

    const response = await proxy(request)
    const csp = response.headers.get('Content-Security-Policy')
    const scriptSrcDirective = csp
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src'))

    expect(csp).toBeTruthy()
    expect(csp).toContain('script-src')
    expect(csp).toContain("'unsafe-inline'")
    expect(scriptSrcDirective).toBeTruthy()
    expect(scriptSrcDirective).toContain("'self'")
    expect(scriptSrcDirective).not.toContain("'strict-dynamic'")
    expect(scriptSrcDirective).not.toMatch(/'nonce-[^']+'/)
    expect(scriptSrcDirective).not.toContain("'unsafe-eval'")
  })
})
