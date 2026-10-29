/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react'
import CreateLobbyPage from '@/app/(site)/lobby/create/page'

let searchParams = 'invite=friend-1'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn() },
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { id: 'user-1' } } }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(searchParams),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, setGuestMode: jest.fn() }),
}))

jest.mock('next/dynamic', () => () => () => null)

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

/** The friends page's Invite opens this page with the friend in `?invite=` (#1584). */
describe('/lobby/create?invite=', () => {
  beforeAll(() => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
  })

  it('starts with the invited friend selected for the new lobby', async () => {
    searchParams = 'invite=friend-1'
    render(<CreateLobbyPage />)
    await act(async () => {})

    expect(screen.getAllByText('lobby.create.friendsSelected').length).toBeGreaterThan(0)
    expect(screen.getByText('lobby.create.friendsToInvite')).toBeTruthy()
  })

  it('selects nobody without the parameter', async () => {
    searchParams = 'gameType=yahtzee'
    render(<CreateLobbyPage />)
    await act(async () => {})

    expect(screen.queryByText('lobby.create.friendsSelected')).toBeNull()
    expect(screen.getByText('lobby.create.settingsRowHint')).toBeTruthy()
  })

  it('ignores a value that cannot be a user id', async () => {
    searchParams = `invite=${encodeURIComponent('<script>')}`
    render(<CreateLobbyPage />)
    await act(async () => {})

    expect(screen.queryByText('lobby.create.friendsSelected')).toBeNull()
  })
})
