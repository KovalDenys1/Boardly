/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import ConnectFourLobbiesPage from '@/app/(site)/games/connect-four/lobbies/page'
import PrivacyNotice from '@/app/(site)/privacy/PrivacyNotice'
import TermsContent from '@/app/(site)/terms/TermsContent'
import AboutContent from '@/app/(site)/about/AboutContent'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { fontSizePx, guaranteedPx } from '../fixtures/tailwind-size'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/' }))
jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ isGuest: false, guestToken: null }) }))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/supabase-client', () => {
  const channel = { on: jest.fn(), subscribe: jest.fn() }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  return { getSupabaseClient: () => ({ channel: () => channel, removeChannel: jest.fn().mockResolvedValue({}) }) }
})
jest.mock('@/lib/db', () => ({ prisma: {} }))
jest.mock('@/lib/consent', () => ({ reopenGoogleConsentMessage: jest.fn() }))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))

function expectTextBreadcrumb(current: string, links: Array<[string, string]>) {
  const nav = screen.getByRole('navigation', { name: 'breadcrumbs.label' })
  const anchors = within(nav).getAllByRole('link')

  expect(anchors.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(links)
  for (const anchor of anchors) {
    // A label that only appears from some breakpoint up leaves a phone an icon-only crumb.
    expect([anchor, ...Array.from(anchor.querySelectorAll('*'))].filter((el) => el.classList.contains('hidden'))).toEqual([])
    expect(fontSizePx(anchor)).toBeGreaterThanOrEqual(12)
    expect(guaranteedPx(anchor, 'height')).toBeGreaterThanOrEqual(24)
    expect(guaranteedPx(anchor, 'width')).toBeGreaterThanOrEqual(24)
  }
  expect(within(nav).getByText(current)).toHaveAttribute('aria-current', 'page')
}

describe('one text breadcrumb with 24px targets (#1561)', () => {
  beforeEach(() => {
    ;(useSession as jest.Mock).mockReturnValue({ status: 'unauthenticated', data: null })
    ;(fetchWithGuest as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ lobbies: [] }) })
  })

  it('gives the game lobbies page text crumbs, not 14px icons', async () => {
    render(<ConnectFourLobbiesPage />)
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'breadcrumbs.label' })).toBeInTheDocument())
    expectTextBreadcrumb('games.connect_four.name', [
      ['breadcrumbs.home', '/'],
      ['breadcrumbs.games', '/games'],
    ])
  })

  it('uses it on the privacy notice', () => {
    render(<PrivacyNotice controller={null} />)
    expectTextBreadcrumb('privacyPolicy.title', [['breadcrumbs.home', '/']])
  })

  it('uses it on the terms', () => {
    render(<TermsContent seller={null} />)
    expectTextBreadcrumb('terms.title', [['breadcrumbs.home', '/']])
  })

  it('uses it on the about page', () => {
    render(<AboutContent />)
    expectTextBreadcrumb('about.breadcrumb', [['breadcrumbs.home', '/']])
  })
})
