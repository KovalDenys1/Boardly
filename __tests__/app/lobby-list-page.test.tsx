import { render, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import LobbyListPage from '@/app/lobby/page'

const mockPush = jest.fn()
const mockFetch = jest.fn()

let postgresChangesCallback: (() => void) | undefined = undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChannel: any = {
  on: jest.fn((_event: string, _filter: object, cb: () => void) => {
    postgresChangesCallback = cb
    return mockChannel
  }),
  subscribe: jest.fn().mockReturnThis(),
}
const mockSupabaseClient = {
  channel: jest.fn().mockReturnValue(mockChannel),
  removeChannel: jest.fn().mockResolvedValue({}),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => mockSupabaseClient),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    ready: true,
  }),
}))

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    isInitialized: true,
  },
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
  }),
}))

jest.mock('@/components/LoadingSkeleton', () => function MockLoadingSkeleton() {
  return <div>Loading...</div>
})
jest.mock('@/components/LobbyFilters', () => function MockLobbyFilters() {
  return <div>Lobby filters</div>
})
jest.mock('@/components/LobbyStats', () => function MockLobbyStats() {
  return <div>Lobby stats</div>
})
jest.mock('@/components/LobbyCard', () => ({
  __esModule: true,
  default: function MockLobbyCard() {
    return <div>Lobby card</div>
  },
}))

function mockJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  } as unknown as Response
}

describe('Lobby list page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    postgresChangesCallback = undefined
    mockChannel.on.mockImplementation((_event: string, _filter: object, cb: () => void) => {
      postgresChangesCallback = cb
      return mockChannel
    })
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        lobbies: [],
        stats: {
          totalLobbies: 0,
          waitingLobbies: 0,
          playingLobbies: 0,
          totalPlayers: 0,
        },
      })
    )
    global.fetch = mockFetch as unknown as typeof fetch
  })

  it('fetches lobbies and subscribes to Supabase Realtime for live updates', async () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    render(<LobbyListPage />)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    const [requestUrl, requestInit] = mockFetch.mock.calls[0] ?? []
    expect(String(requestUrl)).toMatch(/^\/api\/lobby(?:\?|$)/)
    expect(requestInit).toEqual(expect.objectContaining({
      cache: 'no-store',
    }))
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('lobby-list')
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })
})
