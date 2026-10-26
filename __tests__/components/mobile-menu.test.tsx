import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MobileMenu } from '@/components/Header/MobileMenu'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigateToProfile = jest.fn()
let mockPathname = '/'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => mockPathname,
}))

let mockIsGuest = false

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: mockIsGuest,
    guestName: mockIsGuest ? 'HostQ1383' : null,
    clearGuestMode: jest.fn(),
  }),
}))

jest.mock('@/lib/profile-navigation', () => ({
  navigateToProfile: (...args: unknown[]) => mockNavigateToProfile(...args),
}))

jest.mock('@/components/LanguageSwitcher', () => ({
  __esModule: true,
  default: () => <div data-testid="mobile-language-switcher" />,
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => {
      const map: Record<string, string> = {
        'header.menu': 'Open menu',
        'common.close': 'Close menu',
        'header.home': 'Home',
        'header.games': 'Games',
        'header.lobbies': 'Lobbies',
        'header.leaderboard': 'Leaderboard',
        'header.guides': 'Guides',
        'header.friends': 'Friends',
        'header.profile': 'Open profile',
        'header.settings': 'Settings',
        'header.logout': 'Logout',
        'header.login': 'Login',
        'header.signUp': 'Sign Up',
        'header.exitGuest': 'Exit Guest',
        'header.guestSession': 'Guest session',
        'header.language': 'Language',
        'guest.playAsGuest': 'Play as Guest',
        'common.error': 'User',
      }
      return map[key] ?? key
    },
  }),
}))

function renderMenu(props: Partial<React.ComponentProps<typeof MobileMenu>> = {}) {
  return render(
    <MobileMenu
      isAuthenticated
      userName="Tester"
      userEmail="tester@example.com"
      {...props}
    />
  )
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  return screen.getByRole('dialog')
}

describe('MobileMenu', () => {
  beforeEach(() => {
    mockPathname = '/'
    jest.clearAllMocks()
  })

  it('opens a dialog from the hamburger and reports it as expanded', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Open menu' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close menu', expanded: true, hidden: true })).toHaveAttribute('aria-controls', dialog.id)
  })

  it('moves focus into the drawer and back to the hamburger on close', async () => {
    renderMenu()
    const dialog = openMenu()
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open menu' }))
  })

  it('closes when the pathname changes', async () => {
    const { rerender } = renderMenu()
    openMenu()

    mockPathname = '/games'
    rerender(<MobileMenu isAuthenticated userName="Tester" userEmail="tester@example.com" />)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('renders every nav item as an anchor and adds Friends for a member', () => {
    renderMenu()
    openMenu()

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/games', '/lobby', '/leaderboard', '/guides', '/friends'])
  })

  it('closes after a nav link is tapped', async () => {
    renderMenu()
    openMenu()

    fireEvent.click(screen.getByRole('link', { name: 'Guides' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('uses profile navigation helper when tapping the user summary block', () => {
    renderMenu()
    openMenu()
    fireEvent.click(screen.getByLabelText('Open profile'))

    expect(mockNavigateToProfile).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush, replace: mockReplace }),
      '/',
      { tab: 'profile' }
    )
  })

  it('opens profile settings from the bottom action button', () => {
    renderMenu()
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(mockNavigateToProfile).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush, replace: mockReplace }),
      '/',
      { tab: 'settings' }
    )
  })

  it('shows Login and Sign Up to a signed-out visitor and no user card', () => {
    renderMenu({ isAuthenticated: false, userName: null, userEmail: null })
    openMenu()

    expect(screen.getByRole('button', { name: 'Login' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeTruthy()
    expect(screen.queryByLabelText('Open profile')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Friends' })).toBeNull()
  })

  it('keeps the compact menu split active through the tablet breakpoint', () => {
    renderMenu({ isAuthenticated: false })

    expect(screen.getByRole('button', { name: 'Open menu' }).className).toContain('desk:hidden')
  })

  it('renders the language switcher inside the menu panel', () => {
    renderMenu({ isAuthenticated: false })
    openMenu()

    expect(screen.getByTestId('mobile-language-switcher')).toBeTruthy()
  })

  it('opens the Blocked players dialog over the drawer for a guest (#1466)', async () => {
    mockIsGuest = true
    try {
      renderMenu({ isAuthenticated: false, userName: null, userEmail: null })
      openMenu()

      fireEvent.click(screen.getByRole('button', { name: 'blockedPlayers.title' }))

      const dialog = await screen.findByRole('dialog', { name: 'blockedPlayers.title' })
      expect(await within(dialog).findByText('blockedPlayers.empty')).toBeTruthy()
    } finally {
      mockIsGuest = false
    }
  })
})
