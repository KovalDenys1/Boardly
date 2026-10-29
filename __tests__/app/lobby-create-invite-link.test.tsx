/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import CreateLobbyPage from '@/app/(site)/lobby/create/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

let searchParams = 'invite=friend-1'
const mockPush = jest.fn()

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
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(searchParams),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, setGuestMode: jest.fn() }),
}))

jest.mock('next/dynamic', () => () => () => null)

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

function respond(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response
}

/** Creates the lobby through the form, with the invite route answering `invite`. */
async function createLobbyWithInviteAnswer(invite: Response) {
  ;(fetchWithGuest as jest.Mock).mockResolvedValue(respond(200, { lobby: { code: 'ABCD' } }))
  global.fetch = jest.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith('/invite') ? invite : respond(200, {})
  ) as unknown as typeof fetch

  render(<CreateLobbyPage />)
  await act(async () => {})
  await act(async () => {
    fireEvent.submit(document.getElementById('create-lobby-form') as HTMLFormElement)
  })
}

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

/** A friend picked from `?invite=` may have been removed since, and the invite route then refuses them. */
describe('creating a lobby when the invite cannot be sent', () => {
  beforeEach(() => {
    searchParams = 'invite=friend-1'
    mockPush.mockReset()
    ;(showToast.error as jest.Mock).mockReset()
  })

  it('tells the player, and still opens the lobby, when the invite route refuses', async () => {
    await createLobbyWithInviteAnswer(respond(400, { error: 'Selected users are not your friends' }))

    expect(showToast.error).toHaveBeenCalledWith('lobby.create.inviteNotSent')
    expect(mockPush).toHaveBeenCalledWith('/lobby/ABCD')
  })

  it('tells the player when the route skipped one of the friends', async () => {
    await createLobbyWithInviteAnswer(respond(200, { invitedCount: 0, skippedFriendIds: ['friend-1'] }))

    expect(showToast.error).toHaveBeenCalledWith('lobby.create.inviteNotSent')
    expect(mockPush).toHaveBeenCalledWith('/lobby/ABCD')
  })

  it('stays quiet when every invite went out', async () => {
    await createLobbyWithInviteAnswer(respond(200, { invitedCount: 1, skippedFriendIds: [] }))

    expect(showToast.error).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/lobby/ABCD')
  })
})
