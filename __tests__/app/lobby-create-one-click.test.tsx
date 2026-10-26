/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CreateLobbyPage from '@/app/lobby/create/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const pushMock = jest.fn()

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn(), custom: jest.fn() },
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'unauthenticated', data: null }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('gameType=tic_tac_toe'),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: true, setGuestMode: jest.fn() }),
}))

jest.mock('next/dynamic', () => () => () => null)

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

const fetchMock = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

// #1459: the defaults are the whole form. A guest who picks a game and presses
// Create once gets a room, without opening a single setting.
describe('/lobby/create for a guest', () => {
  beforeEach(() => {
    pushMock.mockClear()
    fetchMock.mockReset().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ lobby: { code: 'C4GUEST' } }),
    } as Response)
  })

  it('creates the picked game with one click on Create', async () => {
    render(<CreateLobbyPage />)
    await act(async () => {})

    fireEvent.click(screen.getByText('lobby.create.changeGame'))
    await act(async () => {
      fireEvent.click(screen.getByText('games.connect_four.name'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'lobby.create.create' }))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/lobby')
    expect(JSON.parse(String(init?.body))).toEqual({
      name: '',
      password: '',
      maxPlayers: 2,
      allowSpectators: false,
      turnTimer: 60,
      gameType: 'connect_four',
      theme: 'default',
    })
    expect(pushMock).toHaveBeenCalledWith('/lobby/C4GUEST')
  })
})
