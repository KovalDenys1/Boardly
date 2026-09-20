// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LiarsPartyLobbyPage from '@/app/lobby/[code]/liars-party-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { clientLogger } from '@/lib/client-logger'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()

const broadcastHandlers: Record<string, (data: { payload: unknown }) => void> = {}
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

/** A live round, clock still running, with user-1 waiting on user-2's claim. */
function buildPlayingResponse() {
  const response = buildLobbyResponse()

  response.activeGame.status = 'playing'
  response.activeGame.state.status = 'playing'
  response.activeGame.state.players = response.activeGame.players.map((player) => ({
    id: player.userId,
    name: player.name,
    isActive: true,
  }))
  response.activeGame.state.lastMoveAt = Date.now()
  Object.assign(response.activeGame.state.data, {
    claimantOrder: ['user-2', 'user-1', 'user-3', 'user-4'],
    currentClaimantId: 'user-2',
    activePlayerIds: ['user-1', 'user-2', 'user-3', 'user-4'],
  })

  return response
}

/** A live round whose clock ran out `staleSeconds` ago and that nobody has answered. */
function buildStalledPlayingResponse(staleSeconds: number) {
  const response = buildLobbyResponse()
  const statePlayers = response.activeGame.players.map((player) => ({
    id: player.userId,
    name: player.name,
    isActive: true,
  }))

  response.activeGame.status = 'playing'
  response.activeGame.state.status = 'playing'
  response.activeGame.state.players = statePlayers
  response.activeGame.state.lastMoveAt = Date.now() - staleSeconds * 1000
  Object.assign(response.activeGame.state.data, {
    claimantOrder: ['user-2', 'user-1', 'user-3', 'user-4'],
    currentClaimantId: 'user-2',
    activePlayerIds: ['user-1', 'user-2', 'user-3', 'user-4'],
  })

  return response
}

describe('LiarsPartyLobbyPage', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const toast = showToast as jest.Mocked<typeof showToast>
  const logger = clientLogger as jest.Mocked<typeof clientLogger>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('renders the waiting room', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())
  })

  it('redirects away when a game-abandoned broadcast is received', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['game-abandoned']?.({
        payload: { gameId: 'game-1', reason: 'insufficient_players' },
      })
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

  it('redirects when a player-left broadcast drops a live game below the minimum player count', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildPlayingResponse(),
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-4', username: 'Dave', remainingPlayers: 3 },
      })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('keeps the waiting room open when a player-left drops it below four (#1038)', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-4', username: 'Dave', remainingPlayers: 3 },
      })
    })

    // Three people waiting for a fourth is how this game always starts, so
    // nobody is thrown out to /games and nothing calls the match abandoned.
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
    })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy()
  })

  it('frees the seat through the leave API before navigating away (#1038)', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildPlayingResponse(),
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'lobby.leave' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.confirm' }))

    // keepalive is the half that makes this work at all: the request has to
    // outlive the navigation that follows it on the very next line.
    await waitFor(() => {
      expect(mockFetchWithGuest).toHaveBeenCalledWith(
        '/api/lobby/ABCD/leave',
        expect.objectContaining({ method: 'POST', keepalive: true })
      )
    })
    expect(mockReplace).toHaveBeenCalledWith('/games')
  })

  it('does not tell the player who is leaving that the game was abandoned (#1038)', async () => {
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildPlayingResponse(),
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'lobby.leave' }))
    fireEvent.click(await screen.findByRole('button', { name: 'common.confirm' }))

    // Leaving a four-player table takes the match under its minimum, so the
    // server abandons it and broadcasts that back to the person who left.
    act(() => {
      broadcastHandlers['game-abandoned']?.({
        payload: { gameId: 'game-1', reason: 'insufficient_players' },
      })
    })

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/games'))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('asks the server when the round clock has run out and nobody has acted (#999)', async () => {
    const response = buildStalledPlayingResponse(120)
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response)

    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

    // The lobby GET is the whole fix: it runs applyTimeoutFallback and
    // sweepStalePlayers, and nothing else on this page asks for one.
    await waitFor(
      () =>
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('asking the server'),
          { code: 'ABCD' }
        ),
      { timeout: 3000 }
    )
  })

})
