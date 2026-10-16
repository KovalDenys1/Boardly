import { clearSignupFrom, markSignupFrom, parseSignupFrom, peekSignupFrom } from '@/lib/signup-attribution'

describe('signup attribution (#1439)', () => {
  afterEach(() => localStorage.clear())

  it('keeps the mark until it is cleared, so a failed upgrade can be retried with it', () => {
    markSignupFrom('guest_prompt')

    expect(peekSignupFrom()).toBe('guest_prompt')
    expect(peekSignupFrom()).toBe('guest_prompt')
    clearSignupFrom()
    expect(peekSignupFrom()).toBeNull()
  })

  it('drops a mark older than a day', () => {
    markSignupFrom('guest_prompt')

    expect(peekSignupFrom(Date.now() + 25 * 60 * 60 * 1000)).toBeNull()
  })

  it('accepts only known surfaces', () => {
    expect(parseSignupFrom('guest_prompt')).toBe('guest_prompt')
    expect(parseSignupFrom('header')).toBeNull()
    expect(parseSignupFrom(42)).toBeNull()
  })
})
