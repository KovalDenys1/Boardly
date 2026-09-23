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

describe('deriveSignupSource – social traffic (#1091)', () => {
  const IG_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 612123321)'
  const TIKTOK_ANDROID =
    'Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 trill_330603 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/33.6.3 ByteLocale/en BytedanceWebview/d8a21c6'
  const FB_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.109;FBBV/612345678;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]'
  const SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

  it.each([
    ['https://l.instagram.com/?u=https%3A%2F%2Fboardly.online', 'ref:instagram.com'],
    ['https://www.instagram.com/', 'ref:instagram.com'],
    ['https://lm.facebook.com/l.php?u=x', 'ref:facebook.com'],
    ['https://m.facebook.com/', 'ref:facebook.com'],
    ['https://l.facebook.com/', 'ref:facebook.com'],
    ['https://www.tiktok.com/@boardly', 'ref:tiktok.com'],
    ['https://m.youtube.com/watch?v=1', 'ref:youtube.com'],
    ['https://youtu.be/abc', 'ref:youtube.com'],
    ['https://t.co/abc', 'ref:x.com'],
    ['https://twitter.com/', 'ref:x.com'],
    ['android-app://com.zhiliaoapp.musically/', 'ref:tiktok.com'],
    ['android-app://com.instagram.android/', 'ref:instagram.com'],
    ['https://news.ycombinator.com/', 'ref:news.ycombinator.com'],
  ])('folds %s into %s', (referrer, expected) => {
    expect(deriveSignupSource({ referrer, currentHostname: 'boardly.online' })).toBe(expected)
  })

  it('reads the in-app browser when the app sent no referrer', () => {
    expect(deriveSignupSource({ userAgent: IG_IOS })).toBe('ref:instagram.com')
    expect(deriveSignupSource({ userAgent: TIKTOK_ANDROID })).toBe('ref:tiktok.com')
    expect(deriveSignupSource({ userAgent: FB_IOS })).toBe('ref:facebook.com')
    expect(deriveSignupSource({ userAgent: SAFARI })).toBe('direct')
  })

  it('falls back to the platform click id last', () => {
    expect(deriveSignupSource({ search: '?fbclid=IwAR0abc' })).toBe('ref:facebook.com')
    expect(deriveSignupSource({ search: '?ttclid=E.C.P.abc' })).toBe('ref:tiktok.com')
    expect(deriveSignupSource({ search: '?igshid=abc&fbclid=x' })).toBe('ref:instagram.com')
  })

  it('keeps UTM first and a real referrer second', () => {
    expect(
      deriveSignupSource({ utmSource: 'tiktok', utmMedium: 'social', utmCampaign: 'bio', userAgent: TIKTOK_ANDROID })
    ).toBe('utm:tiktok/social/bio')
    expect(
      deriveSignupSource({ referrer: 'https://www.reddit.com/', userAgent: IG_IOS, currentHostname: 'boardly.online' })
    ).toBe('ref:reddit.com')
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
