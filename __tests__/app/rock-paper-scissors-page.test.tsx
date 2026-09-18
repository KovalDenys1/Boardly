// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RockPaperScissorsLobbyPage from '@/app/lobby/[code]/rock-paper-scissors-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()

const broadcastHandlers: Record<string, (data: { payload: unknown }) => void> = {}
// The board is mocked, so its props are where the state under test is readable.
const mockBoardProps: { current: any } = { current: null }
const mockChannel: any = {
  on: jest.fn((type: string, filter: { event?: string }, handler: (data: unknown) => void) => {
    if (type === 'broadcast' && filter.event) {
      broadcastHandlers[filter.event] = handler as any
    }
    return mockChannel
  }),
  subscribe: jest.fn(() => mockChannel),
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

jest.mock('@/lib/i18n-helpers', () => ({
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
    infoText: jest.fn(),
  },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackLobbyLeaveRedirect: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/RockPaperScissorsGameBoard', () => ({
  __esModule: true,
  default: (props: any) => {
    mockBoardProps.current = props
    return (
      <div data-testid="rps-board">
        <button data-testid="rps-pick-rock" onClick={() => { void props.onSubmitChoice('rock') }} />
      </div>
    )
  },
  WinPips: () => null,
  getChoiceEmoji: () => '❔',
  getChoiceIcon: () => 'rock',
  CHOICE_LABEL_KEY: { rock: 'lobby.choice.rock', paper: 'lobby.choice.paper', scissors: 'lobby.choice.scissors' },
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/components/ConfirmModal', () => ({
  __esModule: true,
  default: () => null,
}))

// The realtime topic carries a per-lobby secret and is fetched from the server
// (#845). Supabase itself is mocked below, so the name only has to be stable.
jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

function buildLobbyResponse(stateOverride?: unknown) {
  const response = {
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
        status: 'playing',
        currentPlayerIndex: 0,
        players: [
          { id: 'user-1', name: 'Alice' },
          { id: 'user-2', name: 'Bob' },
        ],
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
  if (stateOverride) response.activeGame.state = stateOverride as typeof response.activeGame.state
  return response
}

describe('RockPaperScissorsLobbyPage', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const toast = showToast as jest.Mocked<typeof showToast>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('redirects away when a game-abandoned broadcast is received', async () => {
    render(<RockPaperScissorsLobbyPage code="ABCD" />)

    await waitFor(() => expect(screen.getAllByTestId('rps-board').length).toBeGreaterThan(0))

    act(() => {
      broadcastHandlers['game-abandoned']?.({
        payload: {
          gameId: 'game-1',
          reason: 'insufficient_players',
        },
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

  it('redirects away when a player-left broadcast drops below the minimum player count', async () => {
    render(<RockPaperScissorsLobbyPage code="ABCD" />)

    await waitFor(() => expect(screen.getAllByTestId('rps-board').length).toBeGreaterThan(0))

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: {
          userId: 'user-2',
          username: 'Bob',
          remainingPlayers: 1,
        },
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

  describe('a submit that fails (#995)', () => {
    /** Round 1 as the server resolved it while this player's request was out. */
    const resolvedRoundState = () => ({
      id: 'game-1',
      status: 'playing',
      currentPlayerIndex: 0,
      // A real stamp: the round timer is read off this, and a stale one would
      // expire the turn and fire the auto-pick in the middle of the test.
      lastMoveAt: Date.now(),
      players: [
        { id: 'user-1', name: 'Alice' },
        { id: 'user-2', name: 'Bob' },
      ],
      data: {
        mode: 'best-of-3',
        rounds: [{ choices: { 'user-1': 'rock', 'user-2': 'scissors' }, winner: 'user-1' }],
        playerChoices: {},
        scores: { 'user-1': 1 },
        playersReady: [],
        gameWinner: null,
      },
    })

    const isGetCall = (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === 'GET'

    const renderAndWaitForBoard = async () => {
      render(<RockPaperScissorsLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getAllByTestId('rps-board').length).toBeGreaterThan(0))
    }

    const pickRock = async () => {
      await act(async () => {
        fireEvent.click(screen.getAllByTestId('rps-pick-rock')[0])
      })
    }

    it('reverts only this player pick, keeping what the server applied while the request was out', async () => {
      await renderAndWaitForBoard()

      let resolvePost: ((value: unknown) => void) | null = null
      let lobbyGets = 0
      mockFetchWithGuest.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Promise((resolve) => { resolvePost = resolve }) as Promise<Response>
        }
        lobbyGets += 1
        // The first GET is the resync a lobby event triggers mid-submit. The one
        // after the failure is cut off, so what is on screen at the end is the
        // rollback's doing and nothing else's.
        if (lobbyGets === 1) {
          return { ok: true, json: async () => buildLobbyResponse(resolvedRoundState()) } as Response
        }
        throw new Error('network down')
      })

      await pickRock()
      expect(mockBoardProps.current.gameData.playerChoices['user-1']).toBe('rock')

      // Someone leaves, this client resyncs, and the snapshot it gets back is
      // the round the server resolved while the request was still out.
      await act(async () => {
        broadcastHandlers['player-left']?.({
          payload: { userId: 'user-3', username: 'Carol', remainingPlayers: 2 },
        })
      })
      await waitFor(() => expect(mockBoardProps.current.gameData.scores['user-1']).toBe(1))

      await act(async () => {
        resolvePost?.({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
      })

      await waitFor(() => expect(mockBoardProps.current.gameData.playersReady).not.toContain('user-1'))
      expect(mockBoardProps.current.gameData.playerChoices['user-1']).toBeUndefined()
      expect(mockBoardProps.current.gameData.scores['user-1']).toBe(1)
      expect(mockBoardProps.current.gameData.rounds).toHaveLength(1)
    })

    it('resyncs on any failure, not only on 409', async () => {
      await renderAndWaitForBoard()

      const getCallsBefore = mockFetchWithGuest.mock.calls.filter(isGetCall).length
      mockFetchWithGuest.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response
        }
        return { ok: true, json: async () => buildLobbyResponse() } as Response
      })

      await pickRock()

      await waitFor(() =>
        expect(mockFetchWithGuest.mock.calls.filter(isGetCall).length).toBe(getCallsBefore + 1)
      )
    })

    it('does not un-highlight the tile when an opponent broadcast lands mid-submit', async () => {
      await renderAndWaitForBoard()

      let resolvePost: ((value: unknown) => void) | null = null
      mockFetchWithGuest.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Promise((resolve) => { resolvePost = resolve }) as Promise<Response>
        }
        return { ok: true, json: async () => buildLobbyResponse() } as Response
      })

      await pickRock()
      expect(mockBoardProps.current.gameData.playerChoices['user-1']).toBe('rock')

      // Sanitised: the opponent's lock-in shows this client only that they are
      // ready, and it cannot have seen the choice still in flight from here.
      act(() => {
        broadcastHandlers['game-update']?.({
          payload: {
            action: 'state-change',
            payload: {
              state: {
                ...resolvedRoundState(),
                data: {
                  ...resolvedRoundState().data,
                  rounds: [],
                  scores: {},
                  playersReady: ['user-2'],
                },
              },
            },
          },
        })
      })

      expect(mockBoardProps.current.gameData.playerChoices['user-1']).toBe('rock')
      expect(mockBoardProps.current.gameData.playersReady).toContain('user-1')

      await act(async () => {
        resolvePost?.({
          ok: true,
          status: 200,
          json: async () => ({ game: { state: resolvedRoundState(), status: 'playing' } }),
        })
      })
    })
  })
})
