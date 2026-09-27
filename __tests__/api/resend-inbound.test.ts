/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/resend/inbound/route'
import { isSignatureAuthenticatedWebhook } from '@/lib/csrf'

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  logger: { warn: jest.fn(), error: jest.fn() },
}))

const SECRET_BASE64 = Buffer.from('inbound-test-secret').toString('base64')

function signedRequest(body: string, overrides: Record<string, string> = {}) {
  const id = 'msg_test'
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
      ...overrides,
    },
    body,
  })
}

const receivedEvent = JSON.stringify({
  type: 'email.received',
  data: { email_id: 'email_123' },
})

describe('POST /api/resend/inbound', () => {
  beforeEach(() => {
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = `whsec_${SECRET_BASE64}`
    process.env.RESEND_API_KEY = 're_test'
    process.env.SUPPORT_FORWARD_TO = 'owner@example.com'
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('is exempt from the CSRF origin check', () => {
    // Webhooks arrive with no Origin header; without this the delivery is
    // rejected before the handler runs (see #713).
    expect(isSignatureAuthenticatedWebhook('/api/resend/inbound')).toBe(true)
  })

  it('rejects a request whose signature does not match', async () => {
    const req = signedRequest(receivedEvent, { 'svix-signature': 'v1,notasignature' })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects a stale delivery outside the replay window', async () => {
    const body = receivedEvent
    const id = 'msg_test'
    const timestamp = String(Math.floor(Date.now() / 1000) - 600)
    const signature = createHmac('sha256', Buffer.from(SECRET_BASE64, 'base64'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64')

    const req = new NextRequest('https://boardly.online/api/resend/inbound', {
      method: 'POST',
      headers: {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body,
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('ignores event types other than email.received', async () => {
    const res = await POST(signedRequest(JSON.stringify({ type: 'email.sent' })))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true, ignored: true })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fetches the received email and forwards it to the support inbox', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          from: 'player@example.com',
          to: ['support@boardly.online'],
          subject: 'Cannot join lobby',
          html: '<p>help</p>',
          text: 'help',
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'sent_1' }) })

    const res = await POST(signedRequest(receivedEvent))
    expect(res.status).toBe(200)

    const [fetchUrl, fetchInit] = global.fetch.mock.calls[0]
    expect(fetchUrl).toBe('https://api.resend.com/emails/receiving/email_123')
    expect(fetchInit.headers.Authorization).toBe('Bearer re_test')

    const [sendUrl, sendInit] = global.fetch.mock.calls[1]
    expect(sendUrl).toBe('https://api.resend.com/emails')
    const sent = JSON.parse(sendInit.body)
    expect(sent.to).toEqual(['owner@example.com'])
    // Replying from the forwarded copy must reach the player, not ourselves.
    expect(sent.reply_to).toBe('player@example.com')
    expect(sent.subject).toBe('[support@boardly.online] Cannot join lobby')
    // The sender's HTML never becomes the rendered body (#1121) — it rides
    // along as an attachment, and the message body is always plain text.
    expect(sent.html).toBeUndefined()
    expect(sent.text).toBe('help')
    expect(sent.attachments).toEqual([
      { filename: 'original-message.html', content: Buffer.from('<p>help</p>').toString('base64') },
    ])
  })

  it('falls back to a stripped plain-text body when Resend gives no text part', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          from: 'player@example.com',
          to: ['support@boardly.online'],
          subject: 'No text part',
          html: '<p>Hi <b>there</b></p><p>Second line</p>',
          text: null,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'sent_2' }) })

    const res = await POST(signedRequest(receivedEvent))
    expect(res.status).toBe(200)

    const sent = JSON.parse(global.fetch.mock.calls[1][1].body)
    expect(sent.html).toBeUndefined()
    expect(sent.text).toBe('Hi there\n\nSecond line')
    expect(sent.attachments).toHaveLength(1)
  })

  it('still delivers a repeated signed request when no Redis is configured (fail open)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ from: 'p@example.com', to: ['support@boardly.online'], text: 'hi' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'sent_1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ from: 'p@example.com', to: ['support@boardly.online'], text: 'hi' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'sent_2' }) })

    // No KV_REST_API_URL/UPSTASH_REDIS_REST_URL in this test env, so replay
    // dedupe degrades to "not a duplicate" (fail-open, lib/webhook-dedupe.ts).
    // This only pins that an unconfigured store never blocks delivery; the
    // Redis-backed dedupe itself is covered in resend-inbound-dedupe.test.ts.
    const first = await POST(signedRequest(receivedEvent))
    expect(first.status).toBe(200)

    const second = await POST(signedRequest(receivedEvent))
    expect(second.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(4)
  })

  it('returns 500 so Resend retries when fetching the email fails transiently', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 502 })
    const res = await POST(signedRequest(receivedEvent))
    expect(res.status).toBe(500)
  })

  it('acknowledges a permanent failure instead of replaying it forever', async () => {
    // A 4xx from Resend's own API will fail identically on every retry, so
    // asking for one just schedules the same error (#824).
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 404 })
    const res = await POST(signedRequest(receivedEvent))
    expect(res.status).toBe(200)
  })

  it('returns 500 so Resend retries when forwarding fails', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ from: 'p@example.com', to: ['support@boardly.online'], text: 'hi' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    const res = await POST(signedRequest(receivedEvent))
    expect(res.status).toBe(500)
  })
})
