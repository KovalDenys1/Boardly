import { render, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { io } from 'socket.io-client'
import LobbyListPage from '@/app/lobby/page'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'

const mockPush = jest.fn()
const mockFetch = jest.fn()

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

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  getBrowserSocketUrl: jest.fn(() => 'http://localhost:3001'),
}))

jest.mock('@/lib/socket-client-auth', () => ({
  resolveSocketClientAuth: jest.fn(),
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

  it('does not request an authenticated socket token for anonymous visitors', async () => {
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
    expect(resolveSocketClientAuth).not.toHaveBeenCalled()
    expect(io).not.toHaveBeenCalled()
  })
})
