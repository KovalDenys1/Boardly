/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CreateLobbyPage from '@/app/lobby/create/page'

const pushMock = jest.fn()
const setGuestModeMock = jest.fn()

let sessionStatus: 'loading' | 'unauthenticated' | 'authenticated' = 'unauthenticated'
let guestState = { isGuest: false }

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn() },
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: sessionStatus, data: null }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('gameType=tic_tac_toe'),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: guestState.isGuest, setGuestMode: setGuestModeMock }),
}))

// FriendsListModal is the page's only dynamic import and subscribes to Supabase
// presence on mount; it has nothing to do with the gate.
jest.mock('next/dynamic', () => () => () => null)

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

/**
 * Left over from #908: a logged-out visitor opening /lobby/create – which is
 * where every shared ?gameType= link goes – was pushed to `/` with nothing on
 * screen to say why. They now get the same gate Play vs Bot shows.
 */
describe('/lobby/create for a logged-out visitor', () => {
  beforeEach(() => {
    sessionStatus = 'unauthenticated'
    guestState = { isGuest: false }
    pushMock.mockClear()
    setGuestModeMock.mockReset().mockResolvedValue(undefined)
  })

  it('shows the auth gate instead of redirecting home', async () => {
    render(<CreateLobbyPage />)
    await act(async () => {})

    expect(screen.getByText('header.authGateTitle')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('sends login back to the create page with the game kept', async () => {
    render(<CreateLobbyPage />)
    await act(async () => {})

    fireEvent.click(screen.getByText('header.login', { exact: false }))

    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(pushMock.mock.calls[0][0])).toContain('/lobby/create?gameType=tic_tac_toe')
  })

  it('stays on the page after the visitor picks guest play', async () => {
    render(<CreateLobbyPage />)
    await act(async () => {})

    fireEvent.change(screen.getByPlaceholderText('guest.namePlaceholder'), { target: { value: 'Ola' } })
    await act(async () => {
      fireEvent.click(screen.getByText('guest.playAsGuest', { exact: false }))
    })

    expect(setGuestModeMock).toHaveBeenCalledWith('Ola')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('goes home only when the visitor dismisses the gate', async () => {
    const { container } = render(<CreateLobbyPage />)
    await act(async () => {})

    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.click(backdrop)

    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('shows no gate to a guest', async () => {
    guestState = { isGuest: true }
    render(<CreateLobbyPage />)
    await act(async () => {})

    expect(screen.queryByText('header.authGateTitle')).toBeNull()
  })
})
