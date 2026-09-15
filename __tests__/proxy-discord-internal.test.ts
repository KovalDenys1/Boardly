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
const originalDiscordSecret = process.env.DISCORD_INTERNAL_SECRET
const originalCronSecret = process.env.CRON_SECRET

const HEARTBEAT_URL = 'http://localhost:3000/api/internal/discord/heartbeat'
const MEMBER_URL = 'http://localhost:3000/api/internal/discord/members/123456789012345678'

describe('proxy gate for /api/internal/discord/*', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue(null as never)
    process.env.DISCORD_INTERNAL_SECRET = 'discord-secret'
    process.env.CRON_SECRET = 'cron-secret'
  })

  afterAll(() => {
    process.env.DISCORD_INTERNAL_SECRET = originalDiscordSecret
    process.env.CRON_SECRET = originalCronSecret
  })

  it('rejects a request without the secret before it reaches a handler', async () => {
    const response = await proxy(new NextRequest(MEMBER_URL))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('answers 503 when the secret is not configured', async () => {
    delete process.env.DISCORD_INTERNAL_SECRET

    const response = await proxy(
      new NextRequest(MEMBER_URL, { headers: { authorization: 'Bearer discord-secret' } })
    )

    expect(response.status).toBe(503)
  })

  it('does not accept the cron secret on the bot routes', async () => {
    const response = await proxy(
      new NextRequest(MEMBER_URL, { headers: { authorization: 'Bearer cron-secret' } })
    )

    expect(response.status).toBe(401)
  })

  it('lets a heartbeat POST with the secret and no Origin header through the CSRF check', async () => {
    const response = await proxy(
      new NextRequest(HEARTBEAT_URL, {
        method: 'POST',
        headers: { authorization: 'Bearer discord-secret' },
      })
    )

    expect(response.status).not.toBe(401)
    expect(response.status).not.toBe(403)
  })

  it('does not make other API routes trusted for the Discord secret', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/api/friends/request', {
        method: 'POST',
        headers: { authorization: 'Bearer discord-secret', origin: 'https://evil.example' },
      })
    )

    expect(response.status).toBe(403)
  })
})
