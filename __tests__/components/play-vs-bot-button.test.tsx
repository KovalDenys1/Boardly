import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PlayVsBotButton from '@/app/games/components/PlayVsBotButton'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const pushMock = jest.fn()
const setGuestModeMock = jest.fn()

// Mutable so a test can put the session in `loading`, which is where the
// reported bug lived: NextAuth reports it for the first moments after mount.
let sessionStatus: 'loading' | 'unauthenticated' | 'authenticated' = 'unauthenticated'
let guestState = { isGuest: false }

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
  },
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: sessionStatus }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/games/yahtzee',
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: guestState.isGuest,
    setGuestMode: setGuestModeMock,
  }),
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

describe('PlayVsBotButton — fresh guest flow', () => {
  beforeEach(() => {
    sessionStatus = 'unauthenticated'
    guestState = { isGuest: false }
    pushMock.mockClear()
    setGuestModeMock.mockReset().mockResolvedValue(undefined)
    ;(fetchWithGuest as jest.Mock).mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ lobbyCode: 'ABCD' }),
    })
  })

  it('opens a guest-name prompt instead of redirecting to /auth/login when unauthenticated', async () => {
    render(<PlayVsBotButton gameType="yahtzee" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    fireEvent.click(screen.getByText('lobby.create.difficultyEasy'))

    expect(await screen.findByText('guest.playAsGuest')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalledWith('/auth/login')
  })

  it('starts a quick-play game as the chosen difficulty once a guest name is submitted', async () => {
    render(<PlayVsBotButton gameType="yahtzee" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    fireEvent.click(screen.getByText('lobby.create.difficultyEasy'))

    const input = await screen.findByPlaceholderText('guest.namePlaceholder')
    fireEvent.change(input, { target: { value: 'NewVisitor' } })
    fireEvent.click(screen.getByText('guest.playAsGuest'))

    await waitFor(() => expect(setGuestModeMock).toHaveBeenCalledWith('NewVisitor'))
    await waitFor(() => expect(fetchWithGuest).toHaveBeenCalledWith(
      '/api/quick-play',
      expect.objectContaining({
        body: JSON.stringify({ gameType: 'yahtzee', difficulty: 'easy', forceSolo: true }),
      })
    ))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/ABCD'))
  })
})

describe('PlayVsBotButton — the gate cannot be outrun', () => {
  beforeEach(() => {
    sessionStatus = 'unauthenticated'
    guestState = { isGuest: false }
    pushMock.mockClear()
    setGuestModeMock.mockReset().mockResolvedValue(undefined)
    ;(fetchWithGuest as jest.Mock).mockReset().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ lobbyCode: 'ABCD' }),
    })
  })

  it('offers the gate rather than posting when the session has not resolved yet', async () => {
    // Reported on production 2026-09-13: a click in this window skipped the
    // check, posted with no credentials and surfaced the server's raw
    // "Unauthorized" on a page that promises you can play without an account.
    sessionStatus = 'loading'
    render(<PlayVsBotButton gameType="tic_tac_toe" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    await act(async () => {
      fireEvent.click(screen.getByText('lobby.create.difficultyMedium'))
    })

    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(await screen.findByText('guest.playAsGuest')).toBeTruthy()
  })

  it('offers the gate when the server rejects the credentials it was given', async () => {
    // No client check can predict this: a guest token expires while `isGuest`
    // is still true locally. Same answer as a fresh visitor, never a toast.
    guestState = { isGuest: true }
    ;(fetchWithGuest as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })
    render(<PlayVsBotButton gameType="tic_tac_toe" />)

    fireEvent.click(screen.getByText('quickPlay.playVsBot', { exact: false }))
    await act(async () => {
      fireEvent.click(screen.getByText('lobby.create.difficultyMedium'))
    })

    expect(fetchWithGuest).toHaveBeenCalled()
    expect(await screen.findByText('guest.playAsGuest')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
