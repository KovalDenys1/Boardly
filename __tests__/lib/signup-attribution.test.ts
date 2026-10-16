import { markSignupFrom, parseSignupFrom, takeSignupFrom } from '@/lib/signup-attribution'

describe('signup attribution (#1439)', () => {
  afterEach(() => localStorage.clear())

  it('hands the mark over once', () => {
    markSignupFrom('guest_prompt')

    expect(takeSignupFrom()).toBe('guest_prompt')
    expect(takeSignupFrom()).toBeNull()
  })

  it('drops a mark older than a day', () => {
    markSignupFrom('guest_prompt')

    expect(takeSignupFrom(Date.now() + 25 * 60 * 60 * 1000)).toBeNull()
  })

  it('accepts only known surfaces', () => {
    expect(parseSignupFrom('guest_prompt')).toBe('guest_prompt')
    expect(parseSignupFrom('header')).toBeNull()
    expect(parseSignupFrom(42)).toBeNull()
  })
})
