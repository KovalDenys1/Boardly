import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  getCredentialsSessionMaxAgeSeconds,
  isRecentSignIn,
  RECENT_SIGN_IN_WINDOW_MS,
  REMEMBER_ME_MAX_AGE_SECONDS,
} from '@/lib/auth-session-policy'

describe('auth session policy', () => {
  it('uses short-lived credentials session when remember me is disabled', () => {
    expect(getCredentialsSessionMaxAgeSeconds(false)).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS)
  })

  it('uses remembered credentials session when remember me is enabled', () => {
    expect(getCredentialsSessionMaxAgeSeconds(true)).toBe(REMEMBER_ME_MAX_AGE_SECONDS)
  })

  it('keeps remembered sessions longer than default sessions', () => {
    expect(REMEMBER_ME_MAX_AGE_SECONDS).toBeGreaterThan(DEFAULT_SESSION_MAX_AGE_SECONDS)
  })
})

// The one window an email change without a password (#1136) and a Discord link (#1218) share.
describe('isRecentSignIn', () => {
  const now = 1_800_000_000_000

  it('is ten minutes', () => {
    expect(RECENT_SIGN_IN_WINDOW_MS).toBe(10 * 60 * 1000)
  })

  it('accepts a sign-in inside the window, the edge included', () => {
    expect(isRecentSignIn(now - 60 * 1000, now)).toBe(true)
    expect(isRecentSignIn(now - RECENT_SIGN_IN_WINDOW_MS, now)).toBe(true)
  })

  it('refuses one a moment past the window', () => {
    expect(isRecentSignIn(now - RECENT_SIGN_IN_WINDOW_MS - 1, now)).toBe(false)
  })

  it('refuses a token without the claim, or with one that is not a finite number', () => {
    expect(isRecentSignIn(null, now)).toBe(false)
    expect(isRecentSignIn(undefined, now)).toBe(false)
    expect(isRecentSignIn(Number.NaN, now)).toBe(false)
  })
})
