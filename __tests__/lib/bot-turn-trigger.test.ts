/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { buildBotTurnHeaders, getInternalAppOrigin } from '@/lib/bot-turn-trigger'

describe('getInternalAppOrigin', () => {
  const originalNextAuthUrl = process.env.NEXTAUTH_URL
  const originalVercelUrl = process.env.VERCEL_URL

  afterEach(() => {
    if (typeof originalNextAuthUrl === 'string') {
      process.env.NEXTAUTH_URL = originalNextAuthUrl
    } else {
      delete process.env.NEXTAUTH_URL
    }

    if (typeof originalVercelUrl === 'string') {
      process.env.VERCEL_URL = originalVercelUrl
    } else {
      delete process.env.VERCEL_URL
    }
  })

  // #1116 (audit S2-01): the whole point of this function is that it takes no request and
  // so structurally cannot be steered by a spoofed Host / X-Forwarded-Host header. There is
  // nothing here for such a header to influence.
  it('never reads a request — it takes no request parameter at all', () => {
    expect(getInternalAppOrigin.length).toBe(0)
  })

  it('uses NEXTAUTH_URL when configured', () => {
    process.env.NEXTAUTH_URL = 'https://boardly.online'
    delete process.env.VERCEL_URL

    expect(getInternalAppOrigin()).toBe('https://boardly.online')
  })

  it('strips a trailing slash from NEXTAUTH_URL', () => {
    process.env.NEXTAUTH_URL = 'https://boardly.online/'

    expect(getInternalAppOrigin()).toBe('https://boardly.online')
  })

  it('falls back to VERCEL_URL when NEXTAUTH_URL is not set', () => {
    delete process.env.NEXTAUTH_URL
    process.env.VERCEL_URL = 'boardly-preview-abc123.vercel.app'

    expect(getInternalAppOrigin()).toBe('https://boardly-preview-abc123.vercel.app')
  })

  it('falls back to localhost when neither is set', () => {
    delete process.env.NEXTAUTH_URL
    delete process.env.VERCEL_URL

    expect(getInternalAppOrigin()).toBe('http://localhost:3000')
  })

  it('prefers NEXTAUTH_URL over VERCEL_URL when both are set', () => {
    process.env.NEXTAUTH_URL = 'https://boardly.online'
    process.env.VERCEL_URL = 'boardly-preview-abc123.vercel.app'

    expect(getInternalAppOrigin()).toBe('https://boardly.online')
  })
})

describe('buildBotTurnHeaders', () => {
  // #1116 (audit S2-01): when the internal secret is configured, it is the call's only
  // credential — the caller's own Cookie / Authorization must never travel alongside it.
  it('drops Cookie and Authorization when an internal secret is configured', () => {
    const headers = buildBotTurnHeaders({
      internalSecret: 'the-secret',
      authorization: 'Bearer player-token',
      guestToken: 'guest-token',
      cookie: 'next-auth.session-token=abc',
    })

    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'X-Internal-Secret': 'the-secret',
    })
  })

  it('forwards the caller credentials it was given when no internal secret is configured (#870)', () => {
    const headers = buildBotTurnHeaders({
      internalSecret: undefined,
      authorization: 'Bearer player-token',
      guestToken: 'guest-token',
      cookie: 'next-auth.session-token=abc',
    })

    expect(headers).toEqual({
      'Content-Type': 'application/json',
      authorization: 'Bearer player-token',
      'X-Guest-Token': 'guest-token',
      cookie: 'next-auth.session-token=abc',
    })
  })

  it('omits any credential that was not present, without a secret', () => {
    const headers = buildBotTurnHeaders({
      internalSecret: null,
      authorization: null,
      guestToken: null,
      cookie: null,
    })

    expect(headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('treats an empty-string secret as unconfigured', () => {
    const headers = buildBotTurnHeaders({
      internalSecret: '',
      authorization: 'Bearer player-token',
      guestToken: null,
      cookie: null,
    })

    expect(headers).toEqual({
      'Content-Type': 'application/json',
      authorization: 'Bearer player-token',
    })
  })
})
