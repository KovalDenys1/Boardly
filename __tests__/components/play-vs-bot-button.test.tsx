import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PlayVsBotButton from '@/app/games/components/PlayVsBotButton'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const pushMock = jest.fn()
const setGuestModeMock = jest.fn()

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
  useSession: () => ({ status: 'unauthenticated' }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/games/yahtzee',
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    setGuestMode: setGuestModeMock,
  }),
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

describe('PlayVsBotButton — fresh guest flow', () => {
  beforeEach(() => {
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
