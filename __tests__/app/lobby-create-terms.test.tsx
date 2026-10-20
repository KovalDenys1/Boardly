/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CreateLobbyPage from '@/app/lobby/create/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { acceptTerms } from '@/lib/client/terms-consent'

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

jest.mock('@/lib/client/terms-consent', () => ({
  acceptTerms: jest.fn(),
}))

const fetchMock = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
const acceptTermsMock = acceptTerms as jest.MockedFunction<typeof acceptTerms>

const termsRequired = {
  status: 403,
  ok: false,
  json: async () => ({ error: 'Accept the terms before naming a lobby', code: 'TERMS_REQUIRED' }),
} as Response
const created = { status: 200, ok: true, json: async () => ({ lobby: { code: 'NAMED1' } }) } as Response

describe('/lobby/create with a lobby name before the terms (#1482)', () => {
  beforeEach(() => {
    pushMock.mockClear()
    fetchMock.mockReset()
    acceptTermsMock.mockReset().mockResolvedValue(true)
  })

  it('shows the consent panel after a 403, keeps the name, and creates on the next press once accepted', async () => {
    fetchMock.mockResolvedValueOnce(termsRequired).mockResolvedValueOnce(created)
    render(<CreateLobbyPage />)
    await act(async () => {})

    fireEvent.change(screen.getByPlaceholderText('lobby.create.lobbyNamePlaceholder'), { target: { value: 'Friday night' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'lobby.create.create' }))
    })

    expect(screen.getByText('chat.termsPrompt')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('lobby.create.lobbyNamePlaceholder')).toHaveValue('Friday night')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(pushMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'chat.termsAccept' }))
    })
    expect(acceptTermsMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('chat.termsPrompt')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'lobby.create.create' }))
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).name).toBe('Friday night')
    expect(pushMock).toHaveBeenCalledWith('/lobby/NAMED1')
  })
})
