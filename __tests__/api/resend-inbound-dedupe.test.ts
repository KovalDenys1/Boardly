/**
 * @jest-environment @edge-runtime/jest-environment
 *
 * Covers the Redis-backed half of #1121's dedupe: with a shared store
 * configured, a replayed svix-id inside the TTL is turned away without a
 * second forward. resend-inbound.test.ts covers the fail-open behaviour when
 * no store is configured, plus everything else about the route.
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

const redisSet = jest.fn()
const redisDel = jest.fn()

jest.mock('@upstash/redis', () => ({
  Redis: class {
    set = redisSet
    del = redisDel
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  logger: { warn: jest.fn(), error: jest.fn() },
}))

const SECRET_BASE64 = Buffer.from('inbound-dedupe-secret').toString('base64')

function signedRequest(body: string) {
  const id = 'msg_dupe'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', Buffer.from(SECRET_BASE64, 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')

  return new NextRequest('https://boardly.online/api/resend/inbound', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
    body,
  })
}

const receivedEvent = JSON.stringify({
  type: 'email.received',
  data: { email_id: 'email_dupe' },
})

describe('POST /api/resend/inbound - Redis-backed replay dedupe', () => {
  beforeEach(() => {
    jest.resetModules()
    redisSet.mockReset()
    redisDel.mockReset()
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = `whsec_${SECRET_BASE64}`
    process.env.RESEND_API_KEY = 're_test'
    process.env.SUPPORT_FORWARD_TO = 'owner@example.com'
    process.env.KV_REST_API_URL = 'https://example.upstash.io'
    process.env.KV_REST_API_TOKEN = 'token'
    global.fetch = jest.fn()
  })

  afterEach(() => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    jest.resetAllMocks()
  })

  it('claims the first delivery, then turns away an identical replay without forwarding again', async () => {
    redisSet
      .mockResolvedValueOnce('OK') // first claim: key did not exist
      .mockResolvedValueOnce(null) // replay: NX set refuses, key already claimed

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ from: 'p@example.com', to: ['support@boardly.online'], text: 'hi' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'sent_1' }) })

    const { POST } = await import('@/app/api/resend/inbound/route')

    const first = await POST(signedRequest(receivedEvent))
    expect(first.status).toBe(200)
    await expect(first.json()).resolves.toEqual({ received: true })
    expect(global.fetch).toHaveBeenCalledTimes(2)

    const second = await POST(signedRequest(receivedEvent))
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({ duplicate: true })
    // No third or fourth fetch call: the replay never reaches Resend.
    expect(global.fetch).toHaveBeenCalledTimes(2)

    expect(redisSet).toHaveBeenCalledWith('resend-inbound:msg_dupe', '1', { nx: true, ex: 600 })
    expect(redisSet).toHaveBeenCalledTimes(2)
  })

  it('releases the claim on a transient failure, so Resend\'s own retry of the same id is not treated as a replay', async () => {
    redisSet.mockResolvedValue('OK') // claims every time; the point is whether the id was released between calls

    // First attempt: fetching the received email fails transiently (502) -> 500, asking
    // Resend to retry. If the claim were not released, the retry below would be told
    // 'duplicate' and the message would never be forwarded at all.
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 502 })

    const { POST } = await import('@/app/api/resend/inbound/route')

    const first = await POST(signedRequest(receivedEvent))
    expect(first.status).toBe(500)
    expect(redisDel).toHaveBeenCalledWith('resend-inbound:msg_dupe')

    // Resend retries with the identical signed delivery; this time it succeeds.
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ from: 'p@example.com', to: ['support@boardly.online'], text: 'hi' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'sent_1' }) })

    const retry = await POST(signedRequest(receivedEvent))
    expect(retry.status).toBe(200)
    await expect(retry.json()).resolves.toEqual({ received: true })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps the claim after a permanent failure, so a captured request cannot be replayed to try again', async () => {
    redisSet
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null)

    // A 404 from Resend's own API is permanent (#824): acknowledged with 200, no retry
    // asked for, and per #1121 the claim must stand so a replay of the same delivery
    // cannot get a second attempt either.
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 404 })

    const { POST } = await import('@/app/api/resend/inbound/route')

    const first = await POST(signedRequest(receivedEvent))
    expect(first.status).toBe(200)
    expect(redisDel).not.toHaveBeenCalled()

    const replay = await POST(signedRequest(receivedEvent))
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toMatchObject({ duplicate: true })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
