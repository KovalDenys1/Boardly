import { act, render, screen } from '@testing-library/react'
import GuestConversionNudge from '@/components/GuestConversionNudge'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const DISMISS_KEY = 'boardly:guest-conversion-dismissed:v1'

describe('GuestConversionNudge', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('renders by default for a guest who has not dismissed it', () => {
    render(<GuestConversionNudge registerUrl="/auth/register" />)

    expect(screen.queryByText('auth.guestConversion.headline')).not.toBeNull()
  })

  it('dismissing persists via localStorage (survives remount, unlike sessionStorage)', () => {
    const { unmount } = render(<GuestConversionNudge registerUrl="/auth/register" />)

    act(() => {
      screen.getByText('auth.guestConversion.dismiss').click()
    })

    expect(screen.queryByText('auth.guestConversion.headline')).toBeNull()
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1')

    unmount()
    render(<GuestConversionNudge registerUrl="/auth/register" />)

    expect(screen.queryByText('auth.guestConversion.headline')).toBeNull()
  })

  it('does not render if already dismissed in a prior session', () => {
    localStorage.setItem(DISMISS_KEY, '1')

    render(<GuestConversionNudge registerUrl="/auth/register" />)

    expect(screen.queryByText('auth.guestConversion.headline')).toBeNull()
  })

  it('links the CTA to the provided registerUrl', () => {
    render(<GuestConversionNudge registerUrl="/auth/register?returnUrl=%2Flobby%2FABCD" />)

    const cta = screen.getByText('auth.guestConversion.cta').closest('a')
    expect(cta?.getAttribute('href')).toBe('/auth/register?returnUrl=%2Flobby%2FABCD')
  })
})
