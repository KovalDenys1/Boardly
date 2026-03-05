import { act, fireEvent, render, screen } from '@testing-library/react'
import { MobileMenu } from '@/components/Header/MobileMenu'

const mockPush = jest.fn()
const mockReplace = jest.fn()
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
        isAdmin={false}
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
        isAdmin={false}
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
        isAdmin={false}
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
        isAdmin={false}
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
})
