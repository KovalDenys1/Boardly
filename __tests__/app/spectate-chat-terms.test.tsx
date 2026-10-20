// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SpectatorLobbyPage from '@/app/lobby/[code]/spectate/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { acceptTerms } from '@/lib/client/terms-consent'

jest.mock('next/navigation', () => ({
  useParams: () => ({ code: 'abcd' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'viewer-1', name: 'Viewer' } }, status: 'authenticated' }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestName: null, guestId: null }),
}))

jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/client/terms-consent', () => ({
  acceptTerms: jest.fn(),
}))

jest.mock('@/hooks/useBlockedPlayers', () => {
  const blockedIds = new Set(['blocked-1'])
  return { useBlockedPlayers: () => ({ blockedIds, ready: true }) }
})

const broadcastHandlers: Record<string, (message: { payload: unknown }) => void> = {}
const mockChannel: any = {
  on: jest.fn((_type: string, filter: { event: string }, handler: (message: { payload: unknown }) => void) => {
    broadcastHandlers[filter.event] = handler
    return mockChannel
  }),
  subscribe: jest.fn(() => mockChannel),
  track: jest.fn(),
  send: jest.fn(),
  presenceState: jest.fn(() => ({})),
}

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

jest.mock('@/lib/lobby-channel-registry', () => ({
  acquireLobbyChannel: jest.fn(() => ({ release: jest.fn() })),
}))

jest.mock('@/app/lobby/[code]/components/MemoryGameBoard', () => ({
  __esModule: true,
  default: () => <div data-testid="memory-board" />,
}))

const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
const mockAcceptTerms = acceptTerms as jest.MockedFunction<typeof acceptTerms>

function spectateResponse(gameType: string, termsAccepted: boolean) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      lobby: { id: 'lobby-1', code: 'ABCD', name: 'Lobby', gameType, maxPlayers: 4, spectatorCount: 0 },
      activeGame: { id: 'game-1', status: 'playing', players: [], state: JSON.stringify({ status: 'playing', data: {} }) },
      canJoinAsPlayer: false,
      isAdminView: false,
      realtimeTopic: 'lobby:ABCD:secret',
      viewer: { termsAccepted },
    }),
  } as Response
}

function receive(userId: string, username: string, message: string) {
  act(() => {
    broadcastHandlers['spectator-chat']({
      payload: { id: `m-${userId}`, userId, username, lobbyCode: 'ABCD', message, timestamp: 1 },
    })
  })
}

describe('spectator chat asks for the terms first (#1482)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the consent panel instead of the floating composer, and the composer once accepted', async () => {
    mockFetchWithGuest.mockResolvedValue(spectateResponse('memory', false))
    mockAcceptTerms.mockResolvedValue(true)
    render(<SpectatorLobbyPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'spectate.chatTitle' }))

    expect(screen.getByText('chat.termsPrompt')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('spectate.chatPlaceholder')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'chat.termsAccept' }))

    expect(await screen.findByPlaceholderText('spectate.chatPlaceholder')).toBeInTheDocument()
    expect(mockAcceptTerms).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('chat.termsPrompt')).toBeNull()
  })

  it('shows the consent panel instead of the fallback shell composer', async () => {
    mockFetchWithGuest.mockResolvedValue(spectateResponse('fake_artist', false))
    render(<SpectatorLobbyPage />)

    expect(await screen.findByText('chat.termsPrompt')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('spectate.chatPlaceholder')).toBeNull()
  })

  it('keeps the composer for a viewer who already accepted', async () => {
    mockFetchWithGuest.mockResolvedValue(spectateResponse('fake_artist', true))
    render(<SpectatorLobbyPage />)

    expect(await screen.findByPlaceholderText('spectate.chatPlaceholder')).toBeInTheDocument()
    expect(screen.queryByText('chat.termsPrompt')).toBeNull()
  })
})

describe('spectator chat folds a blocked player\'s message (#1482)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('collapses the blocked author\'s text and keeps their name', async () => {
    mockFetchWithGuest.mockResolvedValue(spectateResponse('fake_artist', true))
    render(<SpectatorLobbyPage />)
    await screen.findByPlaceholderText('spectate.chatPlaceholder')
    await waitFor(() => expect(broadcastHandlers['spectator-chat']).toBeDefined())

    receive('blocked-1', 'Mallory', 'something nasty')
    receive('friend-1', 'Friend', 'good move')

    expect(screen.queryByText('something nasty')).toBeNull()
    expect(screen.getByText('blockedPlayers.hiddenText')).toBeInTheDocument()
    expect(screen.getByText('Mallory:', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('good move')).toBeInTheDocument()
  })
})
