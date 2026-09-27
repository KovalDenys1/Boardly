/**
 * @jest-environment @edge-runtime/jest-environment
 */
/**
 * proxy.ts in front of the Control Panel's routes, /api/internal/admin/* (#1231): the secret
 * is checked before a function runs, and a server-to-server POST carrying it, which has no
 * Origin header, is not stopped by the CSRF check. The same shape as the Discord bot's gate.
 */

import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { proxy } from '@/proxy'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>
const originalEnv = {
  panel: process.env.CONTROL_PANEL_API_SECRET,
  discord: process.env.DISCORD_INTERNAL_SECRET,
  cron: process.env.CRON_SECRET,
}

const ADMIN_URL = 'http://localhost:3000/api/internal/admin/suspension-notice'

function post(url: string, headers: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ userId: 'user-1', reason: 'Spam', expiresAt: null }),
  })
}

describe('proxy gate for /api/internal/admin/*', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as never)
    process.env.CONTROL_PANEL_API_SECRET = 'panel-secret'
    process.env.DISCORD_INTERNAL_SECRET = 'discord-secret'
    process.env.CRON_SECRET = 'cron-secret'
  })

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    restore('CONTROL_PANEL_API_SECRET', originalEnv.panel)
    restore('DISCORD_INTERNAL_SECRET', originalEnv.discord)
    restore('CRON_SECRET', originalEnv.cron)
  })

  it('rejects a request without the secret before it reaches a handler', async () => {
    const response = await proxy(post(ADMIN_URL, {}))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('answers 503 when the secret is not configured', async () => {
    delete process.env.CONTROL_PANEL_API_SECRET

    const response = await proxy(post(ADMIN_URL, { authorization: 'Bearer panel-secret' }))

    expect(response.status).toBe(503)
  })

  it('does not accept the cron or the Discord secret on these routes', async () => {
    expect((await proxy(post(ADMIN_URL, { authorization: 'Bearer cron-secret' }))).status).toBe(401)
    expect((await proxy(post(ADMIN_URL, { authorization: 'Bearer discord-secret' }))).status).toBe(401)
  })

  it('lets a POST with the secret and no Origin header through the CSRF check', async () => {
    const response = await proxy(post(ADMIN_URL, { authorization: 'Bearer panel-secret' }))

    expect(response.status).not.toBe(401)
    expect(response.status).not.toBe(403)
  })

  it('does not make other API routes trusted for the panel secret', async () => {
    const response = await proxy(
      post('http://localhost:3000/api/friends/request', {
        authorization: 'Bearer panel-secret',
        origin: 'https://evil.example',
      })
    )

    expect(response.status).toBe(403)
  })

  it('does not open the Discord bot routes with the panel secret', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/api/internal/discord/members/123456789012345678', {
        headers: { authorization: 'Bearer panel-secret' },
      })
    )

    expect(response.status).toBe(401)
  })
})
