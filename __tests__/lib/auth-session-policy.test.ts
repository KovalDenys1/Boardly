import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  getCredentialsSessionMaxAgeSeconds,
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
