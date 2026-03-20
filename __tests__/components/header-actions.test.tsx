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

  it('applies truncation classes for long username/email values', () => {
    const longUserName =
      'Very very very long display name that should not push header controls outside viewport'
    const longEmail =
      'very-very-very-very-long-email-address-for-mobile-header-tests@example-domain.test'

    render(
      <HeaderActions
        isAuthenticated
        userName={longUserName}
        userEmail={longEmail}
      />
    )

    const userNameNode = screen.getByText(longUserName)
    const emailNode = screen.getByText(longEmail)

    expect(userNameNode.className).toContain('truncate')
    expect(emailNode.className).toContain('truncate')
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
      .getAllByTitle('Profile')
      .find((element) => element.tagName.toLowerCase() === 'button')

    expect(profileButton).toBeDefined()
    fireEvent.click(profileButton!)
    expect(mockNavigateToProfile).toHaveBeenCalled()
  })
})
