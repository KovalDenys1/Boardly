import { fireEvent, render, screen } from '@testing-library/react'
import { HeaderActions } from '@/components/Header/HeaderActions'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockPathname = '/games'
const mockNavigateToProfile = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => mockPathname,
}))

jest.mock('next-auth/react', () => ({
  signOut: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    clearGuestMode: jest.fn(),
  }),
}))

jest.mock('@/lib/profile-navigation', () => ({
  navigateToProfile: (...args: unknown[]) => mockNavigateToProfile(...args),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('HeaderActions responsive user block', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('applies truncation class to long username span', () => {
    const longUserName =
      'Very very very long display name that should not push header controls outside viewport'

    render(
      <HeaderActions
        isAuthenticated
        userName={longUserName}
        userEmail="test@example.com"
      />
    )

    const userNameNode = screen.getByText(longUserName)
    expect(userNameNode.className).toContain('truncate')
  })

  it('uses profile navigation helper when avatar button is clicked', () => {
    render(
      <HeaderActions
        isAuthenticated
        userName="Denys"
        userEmail="denys@example.com"
      />
    )

    const profileButton = screen
      .getAllByTitle('Denys')
      .find((element) => element.tagName.toLowerCase() === 'button')

    expect(profileButton).toBeDefined()
    fireEvent.click(profileButton!)
    expect(mockNavigateToProfile).toHaveBeenCalled()
  })

  it('keeps desktop action groups hidden until the large breakpoint', () => {
    render(
      <HeaderActions
        isAuthenticated
        userName="Denys"
        userEmail="denys@example.com"
      />
    )

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    expect(logoutButton.parentElement?.className).toContain('hidden')
    expect(logoutButton.parentElement?.className).toContain('lg:flex')
  })
})
