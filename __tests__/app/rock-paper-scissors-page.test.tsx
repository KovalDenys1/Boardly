import { act, render, screen, waitFor } from '@testing-library/react'
import RockPaperScissorsLobbyPage from '@/app/lobby/[code]/rock-paper-scissors-page'
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
    data: {
      user: {
        id: 'user-1',
      },
    },
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
    t: (key: string) => key,
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
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/RockPaperScissorsGameBoard', () => ({
  __esModule: true,
  default: () => <div data-testid="rps-board" />,
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

function buildLobbyResponse() {
  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'rock_paper_scissors',
      creatorId: 'user-1',
      name: 'Lobby',
      isActive: true,
    },
    activeGame: {
      id: 'game-1',
      gameType: 'rock_paper_scissors',
      status: 'playing',
      currentPlayerIndex: 0,
      state: {
        data: {
          mode: 'best-of-3',
          rounds: [],
          playerChoices: {},
          scores: {},
          playersReady: [],
          gameWinner: null,
        },
      },
      players: [
        {
          id: 'player-1',
          userId: 'user-1',
          name: 'Alice',
          user: {
            username: 'Alice',
          },
        },
        {
          id: 'player-2',
          userId: 'user-2',
          name: 'Bob',
          user: {
            username: 'Bob',
          },
        },
      ],
    },
  }
}

describe('RockPaperScissorsLobbyPage', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const mockResolveSocketClientAuth = resolveSocketClientAuth as jest.MockedFunction<
    typeof resolveSocketClientAuth
  >
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

  it('redirects away when the socket reports an abandoned game', async () => {
    render(<RockPaperScissorsLobbyPage code="ABCD" />)

    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('rps-board')).toBeTruthy())

    act(() => {
      socketHandlers['game-abandoned']?.({
        gameId: 'game-1',
        reason: 'insufficient_players',
      })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'lobby.gameAbandoned',
        undefined,
        undefined,
        { id: 'rps-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('redirects away when a player leaves and the match falls below the minimum player count', async () => {
    render(<RockPaperScissorsLobbyPage code="ABCD" />)

    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('rps-board')).toBeTruthy())

    act(() => {
      socketHandlers['player-left']?.({
        userId: 'user-2',
        username: 'Bob',
        remainingPlayers: 1,
      })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        'toast.playerLeft',
        undefined,
        { player: 'Bob' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })
})
