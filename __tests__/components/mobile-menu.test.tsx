import { act, fireEvent, render, screen } from '@testing-library/react'
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

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestName: null,
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
    t: (key: string) => {
      const map: Record<string, string> = {
        'header.menu': 'Open menu',
        'common.close': 'Close menu',
        'header.home': 'Home',
        'header.games': 'Games',
        'header.lobbies': 'Lobbies',
        'header.leaderboard': 'Leaderboard',

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

describe('MobileMenu', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockPathname = '/'
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('does not auto-close immediately after opening without pathname change', () => {
    render(
      <MobileMenu
        isAuthenticated
        userName="Tester"
        userEmail="tester@example.com"
      />
    )

    fireEvent.click(screen.getByLabelText('Open menu'))

    act(() => {
      jest.advanceTimersByTime(350)
    })

    expect(screen.getAllByLabelText('Close menu').length).toBeGreaterThan(0)
  })

  it('closes menu when pathname changes', () => {
    const { rerender } = render(
      <MobileMenu
        isAuthenticated
        userName="Tester"
        userEmail="tester@example.com"
      />
    )

    fireEvent.click(screen.getByLabelText('Open menu'))
    expect(screen.getAllByLabelText('Close menu').length).toBeGreaterThan(0)

    mockPathname = '/games'
    rerender(
      <MobileMenu
        isAuthenticated
        userName="Tester"
        userEmail="tester@example.com"
      />
    )

    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(screen.getByLabelText('Open menu')).toBeTruthy()
  })

  it('cleans pending close timer on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')

    const { unmount } = render(
      <MobileMenu
        isAuthenticated
        userName="Tester"
        userEmail="tester@example.com"
      />
    )

    fireEvent.click(screen.getByLabelText('Open menu'))
    fireEvent.click(screen.getAllByLabelText('Close menu')[0])

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })

  it('uses profile navigation helper when tapping the user summary block', () => {
    render(
      <MobileMenu
        isAuthenticated
        userName="Tester"
        userEmail="tester@example.com"
      />
    )

    fireEvent.click(screen.getByLabelText('Open menu'))
    fireEvent.click(screen.getByLabelText('Open profile'))

    expect(mockNavigateToProfile).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush, replace: mockReplace }),
      '/',
      { tab: 'profile' }
    )
  })

  it('opens profile settings from the bottom action button', () => {
    render(
      <MobileMenu
        isAuthenticated
        userName="Tester"
        userEmail="tester@example.com"
      />
    )

    fireEvent.click(screen.getByLabelText('Open menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(mockNavigateToProfile).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush, replace: mockReplace }),
      '/',
      { tab: 'settings' }
    )
  })

  it('keeps the compact menu split active through the tablet breakpoint', () => {
    render(
      <MobileMenu
        isAuthenticated={false}
      />
    )

    expect(screen.getByLabelText('Open menu').className).toContain('xl:hidden')
  })

  it('renders the language switcher inside the menu panel', () => {
    render(
      <MobileMenu
        isAuthenticated={false}
      />
    )

    fireEvent.click(screen.getByLabelText('Open menu'))

    expect(screen.getByTestId('mobile-language-switcher')).toBeTruthy()
  })
})
