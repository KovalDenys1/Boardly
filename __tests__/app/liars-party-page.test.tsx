import { act, render, screen, waitFor } from '@testing-library/react'
import LiarsPartyLobbyPage from '@/app/lobby/[code]/liars-party-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { io } from 'socket.io-client'
import { showToast } from '@/lib/i18n-toast'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()
const socketHandlers: Record<string, (payload?: any) => void> = {}
const mockSocket: any = {
  on: jest.fn((event: string, handler: (payload?: any) => void) => {
    socketHandlers[event] = handler
    return mockSocket
  }),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  close: jest.fn(),
  connected: true,
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
    guestId: null,
    guestName: null,
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`
      return key
    },
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    errorFrom: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/socket-client-auth', () => ({
  resolveSocketClientAuth: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  getBrowserSocketUrl: jest.fn(() => 'http://socket.test'),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/components/ReactionOverlay', () => ({
  __esModule: true,
  ReactionOverlay: () => null,
}))

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

function buildLobbyResponse() {
  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'liars_party',
      creatorId: 'user-1',
      name: 'Test Lobby',
      isActive: true,
      turnTimer: 60,
    },
    activeGame: {
      id: 'game-1',
      status: 'waiting',
      state: {
        status: 'waiting',
        currentPlayerIndex: 0,
        players: [],
        lastMoveAt: null,
        data: {
          phase: 'claim',
          currentRound: 1,
          maxRounds: 10,
          eliminationThreshold: 2,
          claimantOrder: [],
          currentClaimantId: '',
          currentClaimantIndex: 0,
          activePlayerIds: [],
          eliminatedPlayerIds: [],
          eliminatedAtRound: {},
          claim: null,
          challengeVotes: [],
          submittedPlayerIds: [],
          currentRoundResolved: false,
          roundResults: [],
          scores: {},
          strikes: {},
          winnerId: null,
          ranking: [],
          completionReason: null,
          finishedAt: null,
          isMvpScaffold: true,
        },
      },
      players: [
        { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', name: 'Carol', user: { username: 'Carol' } },
        { id: 'player-4', userId: 'user-4', name: 'Dave', user: { username: 'Dave' } },
      ],
    },
  }
}

describe('LiarsPartyLobbyPage', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const mockResolveSocketClientAuth = resolveSocketClientAuth as jest.MockedFunction<typeof resolveSocketClientAuth>
  const mockIo = io as jest.MockedFunction<typeof io>
  const toast = showToast as jest.Mocked<typeof showToast>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key])
    mockResolveSocketClientAuth.mockResolvedValue({
      authPayload: { userId: 'user-1' },
      queryPayload: {},
    })
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('renders the waiting room', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())
  })

  it('redirects away when the socket reports an abandoned game', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      socketHandlers['game-abandoned']?.({ gameId: 'game-1', reason: 'insufficient_players' })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'lobby.gameAbandoned',
        undefined,
        undefined,
        { id: 'liars-party-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('redirects when a player leaves and remaining players drop below minimum', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      socketHandlers['player-left']?.({ userId: 'user-4', username: 'Dave', remainingPlayers: 3 })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })
})
