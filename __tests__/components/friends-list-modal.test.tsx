import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import FriendsListModal from '@/components/FriendsListModal'

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

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    errorFrom: jest.fn(),
  },
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => {
    const channelObj = {
      on: function () { return channelObj },
      subscribe: function (cb?: (status: string) => void) { cb?.('SUBSCRIBED'); return channelObj },
      presenceState: () => ({}),
      track: jest.fn().mockResolvedValue(undefined),
    }
    return {
      channel: () => channelObj,
      removeChannel: jest.fn().mockResolvedValue(undefined),
    }
  },
}))

jest.mock('@/components/LoadingSpinner', () => {
  function MockLoadingSpinner() {
    return <div>loading-spinner</div>
  }
  return MockLoadingSpinner
})

const originalFetch = global.fetch
const mockFetch = jest.fn()

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

const FRIENDS_PAYLOAD = {
  friends: [
    { id: 'friend-1', username: 'Alice', avatar: null, email: 'a@example.com', presence: 'offline' },
    { id: 'friend-2', username: 'Bob', avatar: null, email: 'b@example.com', presence: 'offline' },
  ],
}

describe('FriendsListModal', () => {
  beforeAll(() => {
    ;(global as typeof globalThis & { fetch: typeof mockFetch }).fetch = mockFetch as any
  })

  afterAll(() => {
    ;(global as typeof globalThis & { fetch: typeof originalFetch }).fetch = originalFetch as any
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockImplementation(async () => mockJsonResponse(FRIENDS_PAYLOAD))
  })

  it('onInvite mode: renders a per-friend Invite button, not a select+bulk-confirm flow', async () => {
    const onInvite = jest.fn().mockResolvedValue({ invitedCount: 1, skippedCount: 0 })

    render(
      <FriendsListModal
        isOpen
        onClose={jest.fn()}
        onInvite={onInvite}
        lobbyCode="ABCD"
      />
    )

    await waitFor(() => expect(screen.getAllByText('lobby.invite.inviteButton')).toHaveLength(2))

    // No bulk multi-select footer (would show e.g. lobby.invite.send) in this mode
    expect(screen.queryByText('lobby.invite.send')).toBeNull()
    expect(screen.queryByText('common.cancel')).not.toBeNull()
  })

  it('onInvite mode: clicking Invite on one row invites only that friend and flips to Invited', async () => {
    const onInvite = jest.fn().mockResolvedValue({ invitedCount: 1, skippedCount: 0 })

    render(
      <FriendsListModal
        isOpen
        onClose={jest.fn()}
        onInvite={onInvite}
        lobbyCode="ABCD"
      />
    )

    const inviteButtons = await waitFor(() => screen.getAllByText('lobby.invite.inviteButton'))
    fireEvent.click(inviteButtons[0])

    await waitFor(() => expect(onInvite).toHaveBeenCalledWith(['friend-1']))
    await waitFor(() => expect(screen.queryByText(/lobby.invite.invited/)).not.toBeNull())

    // The other row's button is unaffected and still says Invite
    expect(screen.getAllByText('lobby.invite.inviteButton')).toHaveLength(1)
  })

  it('onSelect mode: keeps the original checkbox-style multi-select + confirm button untouched', async () => {
    const onSelect = jest.fn().mockResolvedValue(undefined)

    render(
      <FriendsListModal
        isOpen
        onClose={jest.fn()}
        onSelect={onSelect}
        confirmLabel="common.save"
        lobbyCode="pending-lobby"
      />
    )

    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeNull())

    // No per-row Invite buttons in this mode
    expect(screen.queryByText('lobby.invite.inviteButton')).toBeNull()

    fireEvent.click(screen.getByText('Alice'))
    fireEvent.click(screen.getByText('common.save'))

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(['friend-1']))
  })
})
