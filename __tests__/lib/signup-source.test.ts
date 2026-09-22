/**
 * @jest-environment jsdom
 */
import {
  SIGNUP_SOURCE_HEADER,
  SIGNUP_SOURCE_PARAM,
  deriveSignupSource,
  getSignupSourceFromRequest,
  sanitizeSignupSource,
} from '@/lib/signup-source'

describe('sanitizeSignupSource', () => {
  it('lower-cases and strips unsafe characters', () => {
    expect(sanitizeSignupSource('  REF:Reddit.com  ')).toBe('ref:reddit.com')
    expect(sanitizeSignupSource('utm:re ddit<script>')).toBe('utm:redditscript')
  })

  it('rejects empty and non-string input', () => {
    expect(sanitizeSignupSource('')).toBeNull()
    expect(sanitizeSignupSource(null)).toBeNull()
    expect(sanitizeSignupSource(undefined)).toBeNull()
  })

  it('caps the length', () => {
    expect(sanitizeSignupSource('a'.repeat(500))?.length).toBe(120)
  })
})

describe('deriveSignupSource', () => {
  it('prefers UTM over referrer and keeps the campaign', () => {
    expect(
      deriveSignupSource({
        utmSource: 'reddit',
        utmMedium: 'social',
        utmCampaign: 'launch',
        referrer: 'https://google.com/',
        currentHostname: 'boardly.online',
      })
    ).toBe('utm:reddit/social/launch')
  })

  it('holds an empty medium open so a campaign is never read as one', () => {
    expect(
      deriveSignupSource({ utmSource: 'reddit', utmCampaign: 'launch' })
    ).toBe('utm:reddit/-/launch')
  })

  it('falls back to the referrer hostname, ignoring our own pages', () => {
    expect(
      deriveSignupSource({ referrer: 'https://www.Reddit.com/r/x', currentHostname: 'boardly.online' })
    ).toBe('ref:reddit.com')
    expect(
      deriveSignupSource({ referrer: 'https://boardly.online/games', currentHostname: 'boardly.online' })
    ).toBe('direct')
  })

  it('treats a malformed referrer as direct', () => {
    expect(deriveSignupSource({ referrer: 'not-a-url' })).toBe('direct')
    expect(deriveSignupSource({})).toBe('direct')
  })
})

describe('getSignupSourceFromRequest', () => {
  const request = (value?: string) => ({
    headers: { get: (name: string) => (name === SIGNUP_SOURCE_HEADER && value ? value : null) },
  })

  it('reads and sanitizes the header', () => {
    expect(getSignupSourceFromRequest(request('ref:Reddit.com'))).toBe('ref:reddit.com')
  })

  it('returns null when the header is absent', () => {
    expect(getSignupSourceFromRequest(request())).toBeNull()
  })
})

describe('signup-source-client (browser)', () => {
  const load = async () => {
    jest.resetModules()
    return import('@/lib/signup-source-client')
  }

  const setLocation = (href: string, referrer = '') => {
    window.history.replaceState({}, '', href)
    Object.defineProperty(document, 'referrer', { value: referrer, configurable: true })
  }

  it('derives the source once and caches it for the page', async () => {
    setLocation('/?utm_source=reddit', '')
    const mod = await load()
    expect(mod.captureSignupSource()).toBe('utm:reddit')

    // A later client-side navigation must not re-derive a different first touch.
    setLocation('/lobby/ABC', '')
    expect(mod.captureSignupSource()).toBe('utm:reddit')
  })

  it('exposes the value as a request header', async () => {
    setLocation('/?utm_source=reddit', '')
    const mod = await load()
    expect(mod.signupSourceHeaders()).toEqual({ [SIGNUP_SOURCE_HEADER]: 'utm:reddit' })
  })

  it('writes nothing to cookies or storage', async () => {
    setLocation('/?utm_source=reddit', '')
    const mod = await load()
    mod.captureSignupSource()
    mod.signupSourceHeaders()

    expect(document.cookie).toBe('')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('carries the value across an OAuth redirect in the callback url', async () => {
    setLocation('/auth/login?utm_source=reddit', '')
    const mod = await load()
    expect(mod.withSignupSourceParam('/dashboard')).toBe(
      `/dashboard?${SIGNUP_SOURCE_PARAM}=utm%3Areddit`
    )
  })

  it('takes the value back off the url and clears the address bar', async () => {
    setLocation(`/dashboard?${SIGNUP_SOURCE_PARAM}=ref%3AReddit.com&keep=1`, '')
    const mod = await load()

    expect(mod.takeSignupSourceParam()).toBe('ref:reddit.com')
    expect(window.location.search).toBe('?keep=1')
    // Idempotent: a second call after the strip finds nothing.
    expect(mod.takeSignupSourceParam()).toBeNull()
  })
})
