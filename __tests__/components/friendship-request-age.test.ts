import { formatRequestAge } from '@/components/friendship/request-age'

describe('formatRequestAge', () => {
  const now = new Date(2026, 9, 29, 15, 0).getTime()

  it('says today for a request sent earlier the same day', () => {
    expect(formatRequestAge(new Date(2026, 9, 29, 0, 5).toISOString(), 'en', now)).toBe('today')
  })

  it('counts calendar days, so late last night is yesterday', () => {
    expect(formatRequestAge(new Date(2026, 9, 28, 23, 55).toISOString(), 'en', now)).toBe('yesterday')
    expect(formatRequestAge(new Date(2026, 9, 26, 12, 0).toISOString(), 'en', now)).toBe('3 days ago')
  })

  it('switches to a short date after a week', () => {
    expect(formatRequestAge(new Date(2026, 9, 12, 12, 0).toISOString(), 'en', now)).toBe('Oct 12')
  })

  it('speaks the page language', () => {
    expect(formatRequestAge(new Date(2026, 9, 28, 12, 0).toISOString(), 'no', now)).toBe('i går')
  })

  it('renders nothing for a date it cannot read', () => {
    expect(formatRequestAge('not a date', 'en', now)).toBe('')
  })
})
