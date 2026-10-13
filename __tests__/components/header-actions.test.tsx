import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    t: (key: string) => key,
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

  it('opens Profile, Settings and Logout from the avatar', async () => {
    const { signOut } = jest.requireMock('next-auth/react') as { signOut: jest.Mock }
    render(
      <HeaderActions
        isAuthenticated
        userName="Denys"
        userEmail="denys@example.com"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'header.openUserMenu' }))

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual(['header.profile', 'header.settings', 'header.logout'])

    fireEvent.click(screen.getByRole('menuitem', { name: 'header.settings' }))
    expect(mockNavigateToProfile).toHaveBeenCalledWith(
      expect.objectContaining({ push: mockPush, replace: mockReplace }),
      '/games',
      { tab: 'settings' }
    )

    fireEvent.click(screen.getByRole('button', { name: 'header.openUserMenu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'header.logout' }))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(signOut).toHaveBeenCalledWith({ redirect: false })
  })

  it('keeps desktop action groups hidden until the desktop breakpoint', () => {
    render(
      <HeaderActions
        isAuthenticated
        userName="Denys"
        userEmail="denys@example.com"
      />
    )

    const group = screen.getByRole('button', { name: 'header.openUserMenu' }).closest('div.hidden')
    expect(group?.className).toContain('desk:flex')
  })
})
