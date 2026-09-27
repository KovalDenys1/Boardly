/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - NODE_ENV is readonly to TS; reassigning it per test is the established pattern.

import { NextRequest } from 'next/server'

/**
 * #1146 (S4-06): connect-src used to carry `http://localhost:*`,
 * `http://127.0.0.1:*`, `ws://localhost:*` and `ws://127.0.0.1:*`
 * unconditionally, in production as much as in dev — an injected script on
 * boardly.online could use them to probe a visitor's own local services.
 * `IS_DEVELOPMENT` already gated script-src and upgrade-insecure-requests;
 * this pins that connect-src's localhost sources are now gated by the same
 * flag, in both directions, so local Supabase Realtime/dev-server traffic
 * still works in development without reopening the production hole.
 */
describe('proxy CSP connect-src localhost sources', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    jest.resetModules()
    jest.doMock('next-auth/jwt', () => ({ getToken: jest.fn(() => Promise.resolve(null)) }))
    jest.doMock('@/lib/csrf', () => ({ getSecurityHeaders: jest.fn(() => ({})) }))
    jest.doMock('@/lib/discord/internal-auth', () => ({
      authorizeDiscordInternalRequest: jest.fn(),
      hasValidDiscordInternalSecret: jest.fn(() => false),
    }))
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    jest.dontMock('next-auth/jwt')
    jest.dontMock('@/lib/csrf')
    jest.dontMock('@/lib/discord/internal-auth')
  })

  async function cspFor(nodeEnv: string): Promise<string> {
    process.env.NODE_ENV = nodeEnv
    const { proxy } = await import('@/proxy')
    const request = new NextRequest('http://localhost:3000/games', { method: 'GET' })
    const response = await proxy(request)
    return response.headers.get('Content-Security-Policy') ?? ''
  }

  it('drops every localhost/127.0.0.1 connect-src source outside development', async () => {
    const csp = await cspFor('production')
    expect(csp).not.toContain('localhost')
    expect(csp).not.toContain('127.0.0.1')
  })

  it('keeps them in development, for the local dev server and Supabase Realtime', async () => {
    const csp = await cspFor('development')
    expect(csp).toContain('ws://localhost:*')
    expect(csp).toContain('ws://127.0.0.1:*')
    expect(csp).toContain('http://localhost:*')
    expect(csp).toContain('http://127.0.0.1:*')
  })
})
