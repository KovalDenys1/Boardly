import {
  SIGNUP_SOURCE_COOKIE,
  SIGNUP_SOURCE_MAX_LENGTH,
  deriveSignupSource,
  getSignupSourceFromRequest,
  sanitizeSignupSource,
} from '@/lib/signup-source'
import { captureSignupSource } from '@/lib/signup-source-client'

describe('sanitizeSignupSource', () => {
  it('lower-cases, strips unsafe characters and caps length', () => {
    expect(sanitizeSignupSource('  Ref:Reddit.COM ')).toBe('ref:reddit.com')
    expect(sanitizeSignupSource('utm:<script>alert(1)</script>')).toBe('utm:scriptalert1/script')
    expect(sanitizeSignupSource('x'.repeat(500))).toHaveLength(SIGNUP_SOURCE_MAX_LENGTH)
  })

  it('returns null for empty or non-string input', () => {
    expect(sanitizeSignupSource('')).toBeNull()
    expect(sanitizeSignupSource('   ')).toBeNull()
    expect(sanitizeSignupSource(undefined)).toBeNull()
    expect(sanitizeSignupSource(null)).toBeNull()
  })
})

describe('deriveSignupSource', () => {
  it('prefers UTM over referrer', () => {
    expect(
      deriveSignupSource({ utmSource: 'reddit', utmMedium: 'post', referrer: 'https://google.com/', currentHostname: 'boardly.online' })
    ).toBe('utm:reddit/post')
    expect(deriveSignupSource({ utmSource: 'tiktok' })).toBe('utm:tiktok')
  })

  it('uses the referrer hostname without www', () => {
    expect(deriveSignupSource({ referrer: 'https://www.reddit.com/r/WebGames/x', currentHostname: 'boardly.online' })).toBe('ref:reddit.com')
  })

  it('treats own-host referrer, malformed referrer and no data as direct', () => {
    expect(deriveSignupSource({ referrer: 'https://boardly.online/games', currentHostname: 'boardly.online' })).toBe('direct')
    expect(deriveSignupSource({ referrer: 'not a url', currentHostname: 'boardly.online' })).toBe('direct')
    expect(deriveSignupSource({})).toBe('direct')
  })
})

describe('getSignupSourceFromRequest', () => {
  const request = (value?: string) => ({
    cookies: { get: (name: string) => (name === SIGNUP_SOURCE_COOKIE && value !== undefined ? { name, value } : undefined) },
  })

  it('reads and sanitizes the cookie', () => {
    expect(getSignupSourceFromRequest(request('ref:Reddit.com'))).toBe('ref:reddit.com')
  })

  it('returns null when the cookie is missing', () => {
    expect(getSignupSourceFromRequest(request())).toBeNull()
  })
})

describe('captureSignupSource (browser)', () => {
  const clearCookie = () => {
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=; Max-Age=0; Path=/`
  }

  beforeEach(clearCookie)
  afterEach(clearCookie)

  it('writes the cookie once and never overwrites it', () => {
    Object.defineProperty(document, 'referrer', { value: 'https://news.ycombinator.com/item?id=1', configurable: true })
    captureSignupSource()
    expect(document.cookie).toContain(`${SIGNUP_SOURCE_COOKIE}=ref%3Anews.ycombinator.com`)

    Object.defineProperty(document, 'referrer', { value: 'https://reddit.com/', configurable: true })
    captureSignupSource()
    expect(document.cookie).toContain('news.ycombinator.com')
    expect(document.cookie).not.toContain('reddit')
  })
})

describe('utm_campaign (#911)', () => {
  it('keeps the campaign, so two posts on one platform are two rows', () => {
    expect(
      deriveSignupSource({ utmSource: 'reddit', utmMedium: 'social', utmCampaign: 'webgames-launch' }),
    ).toBe('utm:reddit/social/webgames-launch')
  })

  it('holds the medium slot open when only a campaign is given', () => {
    // Without the placeholder, utm:reddit/launch would be indistinguishable from a medium.
    expect(deriveSignupSource({ utmSource: 'reddit', utmCampaign: 'launch' })).toBe(
      'utm:reddit/-/launch',
    )
  })

  it('is unchanged when there is no campaign', () => {
    expect(deriveSignupSource({ utmSource: 'chatgpt.com', utmMedium: 'referral' })).toBe(
      'utm:chatgpt.com/referral',
    )
    expect(deriveSignupSource({ utmSource: 'bing' })).toBe('utm:bing')
  })
})
