import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import Friends from '@/components/Friends'
import { showToast } from '@/lib/i18n-toast'

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => {
    const channelObj = {
      on: function () { return channelObj },
      subscribe: function (cb?: (status: string) => void) { cb?.('SUBSCRIBED'); return channelObj },
      presenceState: () => ({}),
      track: jest.fn().mockResolvedValue(undefined),
      untrack: jest.fn().mockResolvedValue(undefined),
    }
    return {
      channel: () => channelObj,
      removeChannel: jest.fn().mockResolvedValue(undefined),
    }
  },
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    errorFrom: jest.fn(),
  },
}))

jest.mock('@/components/LoadingSpinner', () => {
  function MockLoadingSpinner() {
    return <div>loading-spinner</div>
  }

  return MockLoadingSpinner
})

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockShowToast = showToast as jest.Mocked<typeof showToast>
const originalFetch = global.fetch
const mockFetch = jest.fn()
const clipboardWriteText = jest.fn()

type Payloads = {
  friends?: unknown[]
  received?: unknown[]
  sent?: unknown[]
}

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

function friend(id: string, username: string, presence: string) {
  return {
    id,
    username,
    avatar: null,
    publicProfileId: `public-${id}`,
    friendshipId: `friendship-${id}`,
    friendsSince: '2026-01-02T00:00:00.000Z',
    presence,
  }
}

function serve(payloads: Payloads) {
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    const method = init?.method ?? 'GET'

    if (method !== 'GET') return mockJsonResponse({ success: true })
    if (url === '/api/friends') return mockJsonResponse({ friends: payloads.friends ?? [] })
    if (url === '/api/friends/request?type=received') return mockJsonResponse({ requests: payloads.received ?? [] })
    if (url === '/api/friends/request?type=sent') return mockJsonResponse({ requests: payloads.sent ?? [] })
    if (url === '/api/user/friend-code') {
      return mockJsonResponse({ friendCode: '12345', publicProfileId: 'publicuser01' })
    }
    return mockJsonResponse({})
  })
}

function callsTo(url: string, method = 'GET') {
  return mockFetch.mock.calls.filter(
    ([input, init]) => String(input) === url && (init?.method ?? 'GET') === method
  )
}

describe('Friends', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as any
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as any
  })

  beforeEach(() => {
    jest.clearAllMocks()
    clipboardWriteText.mockResolvedValue(undefined)

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })

    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', emailVerified: '2026-01-01T00:00:00.000Z' } },
      status: 'authenticated',
      update: jest.fn(),
    } as any)

    serve({})
  })

  it('shows an empty state with one action when there are no friends', async () => {
    render(<Friends />)

    const section = await screen.findByRole('region', { name: 'profile.friends.title' })
    expect(within(section).getByRole('heading', { name: 'profile.friends.noFriends' })).toBeTruthy()

    const actions = within(section).getAllByRole('button')
    expect(actions).toHaveLength(1)
    expect(actions[0].textContent).toContain('profile.friends.shareProfileLink')
    expect(within(section).queryAllByRole('link')).toHaveLength(0)
  })

  it('shares the profile link from the empty state', async () => {
    render(<Friends />)

    const section = await screen.findByRole('region', { name: 'profile.friends.title' })
    fireEvent.click(within(section).getByRole('button', { name: /profile\.friends\.shareProfileLink/ }))

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(`${window.location.origin}/u/publicuser01`)
    })
    expect(mockShowToast.success).toHaveBeenCalledWith('profile.friends.profileLinkCopied')
  })

  it('shows received requests beside the add-friend field, with no tab to open', async () => {
    serve({
      received: [
        {
          id: 'request-1',
          senderId: 'sender-1',
          status: 'pending',
          message: null,
          createdAt: new Date().toISOString(),
          sender: { id: 'sender-1', username: 'Ingrid', avatar: null },
        },
      ],
    })

    render(<Friends />)

    expect(await screen.findByRole('button', { name: 'profile.friends.accept' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'profile.friends.reject' })).toBeTruthy()
    expect(screen.getByLabelText('profile.friends.addLabel')).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('accepts a request, drops it from the list and reloads the friends', async () => {
    serve({
      received: [
        {
          id: 'request-1',
          senderId: 'sender-1',
          status: 'pending',
          message: null,
          createdAt: new Date().toISOString(),
          sender: { id: 'sender-1', username: 'Ingrid', avatar: null },
        },
      ],
    })

    render(<Friends />)
    fireEvent.click(await screen.findByRole('button', { name: 'profile.friends.accept' }))

    await waitFor(() => {
      expect(callsTo('/api/friends/request/request-1/accept', 'POST')).toHaveLength(1)
    })
    await waitFor(() => {
      expect(screen.queryByText('Ingrid')).toBeNull()
    })
    expect(callsTo('/api/friends').length).toBeGreaterThanOrEqual(2)
  })

  it('gives each friend an online state and an invite into a new lobby', async () => {
    serve({
      friends: [friend('friend-2', 'Sofie', 'offline'), friend('friend-1', 'Aksel', 'in_game')],
    })

    render(<Friends />)

    const section = await screen.findByRole('region', { name: 'profile.friends.title' })
    const rows = await within(section).findAllByRole('listitem')
    expect(rows).toHaveLength(2)

    expect(within(rows[0]).getByText('Aksel')).toBeTruthy()
    expect(within(rows[0]).getByText('profile.friends.presence.inGame')).toBeTruthy()
    expect(within(rows[1]).getByText('Sofie')).toBeTruthy()
    expect(within(rows[1]).getByText('profile.friends.presence.notOnline')).toBeTruthy()

    const invites = rows.map((row) => within(row).getByRole('link', { name: 'profile.friends.inviteToGame' }))
    expect(invites.map((link) => link.getAttribute('href'))).toEqual([
      '/lobby/create?invite=friend-1',
      '/lobby/create?invite=friend-2',
    ])
  })

  it('sends a five-digit code to add-by-code from the one add field', async () => {
    render(<Friends />)

    const field = await screen.findByLabelText('profile.friends.addLabel')
    fireEvent.change(field, { target: { value: '12 345' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'profile.friends.sendRequest' }))
    })

    const [call] = callsTo('/api/friends/add-by-code', 'POST')
    expect(JSON.parse(String(call[1].body))).toEqual({ friendCode: '12345' })
    expect(mockShowToast.success).toHaveBeenCalledWith('profile.friends.requestSent')
  })

  it('sends a profile link to the request route from the same field', async () => {
    render(<Friends />)

    const field = await screen.findByLabelText('profile.friends.addLabel')
    fireEvent.change(field, { target: { value: 'https://boardly.online/u/abcdefABCDEF' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'profile.friends.sendRequest' }))
    })

    const [call] = callsTo('/api/friends/request', 'POST')
    expect(JSON.parse(String(call[1].body))).toEqual({ receiverPublicProfileId: 'abcdefABCDEF' })
  })

  it('refuses input that is neither a code nor a profile link', async () => {
    render(<Friends />)

    const field = await screen.findByLabelText('profile.friends.addLabel')
    fireEvent.change(field, { target: { value: 'hello' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'profile.friends.sendRequest' }))
    })

    expect(mockShowToast.error).toHaveBeenCalledWith('profile.friends.errors.invalidCodeOrLink')
    expect(callsTo('/api/friends/add-by-code', 'POST')).toHaveLength(0)
    expect(callsTo('/api/friends/request', 'POST')).toHaveLength(0)
  })

  it('asks in a dialog before removing a friend', async () => {
    serve({ friends: [friend('friend-1', 'Aksel', 'offline')] })

    render(<Friends />)

    fireEvent.click(await screen.findByRole('button', { name: 'profile.friends.removeFriend' }))
    const dialog = await screen.findByRole('dialog')
    expect(callsTo('/api/friends/friendship-friend-1', 'DELETE')).toHaveLength(0)

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'profile.friends.remove' }))
    })

    expect(callsTo('/api/friends/friendship-friend-1', 'DELETE')).toHaveLength(1)
  })

  it('copies the friend code', async () => {
    render(<Friends />)

    fireEvent.click(await screen.findByRole('button', { name: 'profile.friends.copyCode' }))

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('12345')
    })
    expect(mockShowToast.success).toHaveBeenCalledWith('profile.friends.friendCodeCopied')
  })

  it('asks for a verified email before loading anything', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', emailVerified: null } },
      status: 'authenticated',
      update: jest.fn(),
    } as any)

    render(<Friends />)

    const verify = await screen.findByRole('link', { name: 'profile.friends.verifyEmail' })
    expect(verify.getAttribute('href')).toBe('/auth/verify-email')
    expect(screen.queryByLabelText('profile.friends.addLabel')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
