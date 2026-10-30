/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import DeleteAccountPage from '@/app/(site)/auth/delete-account/page'
import OAuthErrorPage from '@/app/(site)/auth/error-oauth/page'
import VerifyEmailPage from '@/app/(site)/auth/verify-email/page'

let mockSearch = ''

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))
jest.mock('next-auth/react', () => ({ useSession: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { success: jest.fn(), error: jest.fn() } }))

// In globals.css .page-shell and .page-shell-full are a fixed height with overflow hidden, so a tall card is cut off.
const FIXED_FRAMES = ['page-shell', 'page-shell-full', 'mobile-vh-100', 'h-screen', 'h-dvh', 'overflow-hidden']

function expectFrameGrowsWithItsContent() {
  const heading = screen.getByRole('heading', { level: 1 })
  const frames: HTMLElement[] = []
  for (let el = heading.parentElement; el && el !== document.body; el = el.parentElement) frames.push(el)

  for (const frame of frames) {
    expect(FIXED_FRAMES.filter((name) => frame.classList.contains(name))).toEqual([])
  }
  expect(frames[frames.length - 2]?.classList.contains('min-h-(--game-h)')).toBe(true)
}

describe('auth pages scroll with the document instead of clipping a tall card (#1559)', () => {
  beforeEach(() => {
    ;(useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated', update: jest.fn() })
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
  })

  it.each([
    ['delete-account without a token', ''],
    ['delete-account asking for confirmation', 'token=abc'],
  ])('%s', (_name, search) => {
    mockSearch = search
    render(<DeleteAccountPage />)
    expectFrameGrowsWithItsContent()
  })

  it('verify-email without a token', () => {
    mockSearch = ''
    render(<VerifyEmailPage />)
    expectFrameGrowsWithItsContent()
  })

  it('error-oauth signed out', () => {
    mockSearch = 'error=OAuthAccountNotLinked&provider=discord'
    render(<OAuthErrorPage />)
    expectFrameGrowsWithItsContent()
  })

  it('error-oauth signed in', () => {
    mockSearch = 'error=OAuthAccountNotLinked&provider=discord'
    ;(useSession as jest.Mock).mockReturnValue({ data: { user: { email: 'a@example.test' } }, status: 'authenticated', update: jest.fn() })
    render(<OAuthErrorPage />)
    expectFrameGrowsWithItsContent()
  })
})
