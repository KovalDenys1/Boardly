/**
 * The guest menu loads after the header (#1466 bundle budget): a guest is only known in the
 * browser, so the menu never rendered on the server anyway. Until it loads, a placeholder with the
 * same box and the guest's name holds its place, so the header does not shift when it arrives.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { HeaderActions } from '@/components/Header/HeaderActions'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/games',
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signOut: jest.fn(),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: true, guestName: 'HostQ1466', clearGuestMode: jest.fn(), forgetGuest: jest.fn() }),
}))

jest.mock('@/lib/i18n-toast', () => ({ showToast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

describe('HeaderActions for a guest', () => {
  it('holds the guest menu’s place with the guest name, then opens the real menu', async () => {
    const { container } = render(<HeaderActions isAuthenticated={false} />)

    // Present from the first client render, before the menu's code has arrived.
    expect(container.textContent).toContain('HostQ1466')

    const menuButton = await screen.findByRole('button', { name: 'HostQ1466' })
    fireEvent.click(menuButton)
    expect(await screen.findByRole('button', { name: 'blockedPlayers.title' })).toBeTruthy()
    expect(screen.getAllByText('HostQ1466')).toHaveLength(1)
  })
})
