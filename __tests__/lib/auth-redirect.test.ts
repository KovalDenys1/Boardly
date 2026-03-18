import {
  buildAuthUrl,
  resolveReturnUrlFromLocation,
  resolveReturnUrlFromSearchParams,
  sanitizeReturnUrl,
} from '@/lib/auth-redirect'

describe('auth redirect helpers', () => {
  it('sanitizes unsafe return urls', () => {
    expect(sanitizeReturnUrl('https://example.com')).toBe('/')
    expect(sanitizeReturnUrl('//evil.test')).toBe('/')
    expect(sanitizeReturnUrl('javascript:alert(1)')).toBe('/')
  })

  it('builds auth urls with encoded return urls', () => {
    expect(buildAuthUrl('login', '/u/Player123?tab=stats')).toBe(
      '/auth/login?returnUrl=%2Fu%2FPlayer123%3Ftab%3Dstats'
    )
    expect(buildAuthUrl('register', '/')).toBe('/auth/register')
  })

  it('resolves returnUrl and supports legacy callbackUrl', () => {
    expect(
      resolveReturnUrlFromSearchParams(
        new URLSearchParams('returnUrl=%2Fu%2FPlayer123')
      )
    ).toBe('/u/Player123')

    expect(
      resolveReturnUrlFromSearchParams(
        new URLSearchParams('callbackUrl=%2Fgames')
      )
    ).toBe('/games')
  })

  it('uses the current page outside auth routes', () => {
    expect(
      resolveReturnUrlFromLocation({
        pathname: '/games',
        search: '?filter=available',
      })
    ).toBe('/games?filter=available')
  })

  it('keeps the original destination on auth routes', () => {
    expect(
      resolveReturnUrlFromLocation({
        pathname: '/auth/login',
        search: '?returnUrl=%2Fu%2FPlayer123',
      })
    ).toBe('/u/Player123')

    expect(
      resolveReturnUrlFromLocation({
        pathname: '/auth/register',
        search: '',
      })
    ).toBe('/')
  })
})
