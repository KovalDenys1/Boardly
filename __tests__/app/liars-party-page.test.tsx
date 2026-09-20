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
      // Shaped like the real GET /api/lobby/[code] response: Prisma `players`
      // rows have no `name` column, so the display name is only ever on the
      // joined user. The fixture used to add a `name` of its own, which is why
      // every screen could read `p.name` and still look right in this suite
      // while a real game showed blanks and raw guest ids.
      players: [
        { id: 'player-1', userId: 'user-1', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', user: { username: 'Carol' } },
        { id: 'player-4', userId: 'user-4', user: { username: 'Dave' } },
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

/**
 * The shell's scrolling content region, the one `.liars-content` under the
 * header and the status banner. Every phase renders into it, and the layout
 * DoD's first rule is that no in-game screen has an empty region – so what is
 * inside it is the assertion, not the shell's own test id, which is present
 * whether or not the phase rendered anything at all. That is exactly how the
 * blank claim screen got through review the first time.
 */
function contentRegion(): HTMLElement {
  const region = document.querySelector('.liars-content')
  if (!region) throw new Error('no .liars-content region on the page')
  return region as HTMLElement
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

/**
 * A reveal phase exactly as the engine leaves it: the claim is in, everyone has
 * voted, the phase is `reveal` – and `roundResults` is still empty, because the
 * engine resolves the round inside `advanceAfterReveal`, on the way out of this
 * screen. `bluffCaught` is false here (one challenger out of three is not the
 * strict majority rule 3 needs) while `isBluff` is true, which is the case that
 * separates "did the table catch it" from "was the voter right".
 */
function buildRevealResponse() {
  const response = buildPlayingResponse()
  Object.assign(response.activeGame.state.data, {
    phase: 'reveal',
    claim: { playerId: 'user-2', text: 'I have never lost at chess', isBluff: true, submittedAt: Date.now() },
    challengeVotes: [
      { playerId: 'user-1', decision: 'challenge', submittedAt: Date.now() },
      { playerId: 'user-3', decision: 'believe', submittedAt: Date.now() },
      { playerId: 'user-4', decision: 'believe', submittedAt: Date.now() },
    ],
    roundResults: [],
    currentRoundResolved: false,
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

    fireEvent.click(screen.getByRole('button', { name: 'game.ui.leave' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'game.ui.leave' }))
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

  // The claim phase is what every player but one is looking at for most of the
  // game, and it used to render literally nothing for them: `ClaimScreen`
  // returned null off its claimant branch, so the region under the banner was
  // empty for three of four players and for every spectator, at every viewport.
  describe('the claim phase fills its content region for everyone (#1040)', () => {
    it('shows the table to a player who is not the claimant', async () => {
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => buildPlayingResponse(),
      } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      // user-1 is a voter this round; user-2 holds the floor.
      expect(contentRegion().textContent?.trim()).not.toBe('')
      expect(screen.getByTestId('liars-standings')).toBeTruthy()
      for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
        expect(screen.getByText(name)).toBeTruthy()
      }
    })

    it('shows the claim form to the claimant', async () => {
      const response = buildPlayingResponse()
      response.activeGame.state.data.currentClaimantId = 'user-1'
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      expect(screen.getByPlaceholderText('liarsParty.claimPlaceholder')).toBeTruthy()
      // The claimant gets the table as the second column too: one 560px form
      // alone in an 1100px region is the DoD's floating-card case.
      expect(screen.getByTestId('liars-standings')).toBeTruthy()
    })

    it('shows the table to a spectator', async () => {
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => buildPlayingResponse(),
      } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" isSpectator />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      expect(contentRegion().textContent?.trim()).not.toBe('')
      expect(screen.getByTestId('liars-standings')).toBeTruthy()
    })

    it('names players from the joined user, never a raw id', async () => {
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => buildPlayingResponse(),
      } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-claim-screen')).toBeTruthy())

      const region = contentRegion().textContent ?? ''
      expect(region).toContain('Bob')
      // The ids are what leaked through when the page read a `name` the API
      // never sends – `user-2` in this fixture, `guest-89b9ec22-…` in a real game.
      for (const id of ['user-1', 'user-2', 'user-3', 'user-4']) {
        expect(region).not.toContain(id)
      }
    })

    it('shows the table under the banner to an eliminated player', async () => {
      const response = buildPlayingResponse()
      Object.assign(response.activeGame.state.data, {
        activePlayerIds: ['user-2', 'user-3', 'user-4'],
        eliminatedPlayerIds: ['user-1'],
        eliminatedAtRound: { 'user-1': 1 },
      })
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() =>
        expect(screen.getByTestId('liars-party-eliminated-claim-screen')).toBeTruthy()
      )

      expect(screen.getByTestId('eliminated-banner')).toBeTruthy()
      expect(screen.getByTestId('liars-standings')).toBeTruthy()
    })
  })

  // The reveal screen read `roundResults[length - 1]`, which the engine has not
  // written yet while this phase is on screen (lib/games/liars-party-game.ts:479).
  describe('the reveal screen reads the round it is revealing (#1040)', () => {
    it('shows the vote breakdown and the scores during reveal, not just the verdict', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildRevealResponse() } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-party-reveal-screen')).toBeTruthy())

      expect(screen.getByTestId('liars-vote-breakdown')).toBeTruthy()
      expect(screen.getByTestId('liars-standings')).toBeTruthy()
      const region = contentRegion().textContent ?? ''
      expect(region).toContain('I have never lost at chess')
      expect(region).toContain('liarsParty.wasBluff')
    })

    it('marks a challenger on a bluff correct even when the table did not catch it', async () => {
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildRevealResponse() } as Response)

      render(<LiarsPartyLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('liars-vote-breakdown')).toBeTruthy())

      // One row per voter; the tick/cross is the icon in each row. Alice
      // challenged a claim that was a bluff, so the engine pays her – the row
      // has to agree with the engine, not with the strict-majority verdict.
      const rows = [...screen.getByTestId('liars-vote-breakdown').querySelectorAll('.space-y-2 > div')]
      expect(rows).toHaveLength(3)
      const iconOf = (row: Element) => row.querySelector('svg')?.getAttribute('data-icon')
      expect(rows.map((r) => (r.textContent ?? '').split('liarsParty')[0].trim())).toEqual(['Alice', 'Carol', 'Dave'])
      expect(iconOf(rows[0])).toBe('check')
      expect(iconOf(rows[1])).toBe('close')
      expect(iconOf(rows[2])).toBe('close')
    })
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
