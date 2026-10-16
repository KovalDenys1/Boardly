import { act, render, screen } from '@testing-library/react'
import GuestConversionNudge from '@/components/GuestConversionNudge'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const DISMISS_KEY = 'boardly:guest-conversion-dismissed:v2'

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
    expect(Number(localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(0)

    unmount()
    render(<GuestConversionNudge registerUrl="/auth/register" />)

    expect(screen.queryByText('auth.guestConversion.headline')).toBeNull()
  })

  it('does not render if already dismissed in a prior session', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))

    render(<GuestConversionNudge registerUrl="/auth/register" />)

    expect(screen.queryByText('auth.guestConversion.headline')).toBeNull()
  })

  it('links the CTA to the provided registerUrl', () => {
    render(<GuestConversionNudge registerUrl="/auth/register?returnUrl=%2Flobby%2FABCD" />)

    const cta = screen.getByText('auth.guestConversion.cta').closest('a')
    expect(cta?.getAttribute('href')).toBe('/auth/register?returnUrl=%2Flobby%2FABCD')
  })

  it('renders again once the 24h dismissal window has expired', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() - 25 * 60 * 60 * 1000))
    render(<GuestConversionNudge registerUrl="/auth/register" />)

    expect(screen.queryByText('auth.guestConversion.headline')).not.toBeNull()
  })

  it('marks the click so the account it becomes is credited to the prompt (#1439)', () => {
    render(<GuestConversionNudge registerUrl="/auth/register" gameType="memory" lobbyCode="ABCD" />)

    act(() => {
      screen.getByText('auth.guestConversion.cta').closest('a')?.addEventListener('click', (e) => e.preventDefault())
      screen.getByText('auth.guestConversion.cta').click()
    })

    expect(JSON.parse(localStorage.getItem('boardly:signup-from') ?? '{}').from).toBe('guest_prompt')
  })

  it('names the replay only when the end screen offers one (#1440)', () => {
    const { unmount } = render(<GuestConversionNudge registerUrl="/auth/register" hasReplay />)
    expect(screen.queryByText('auth.guestConversion.bodyReplay')).not.toBeNull()
    unmount()

    render(<GuestConversionNudge registerUrl="/auth/register" />)
    expect(screen.queryByText('auth.guestConversion.body')).not.toBeNull()
  })
})
