// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AliasLobbyPage from '@/app/(site)/lobby/[code]/alias-page'
import { AliasGame } from '@/lib/games/alias'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { frameFor, installSignedRealtime } from '@/__tests__/fixtures/signed-realtime'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()

installSignedRealtime()
const REALTIME_TOPIC = 'lobby:ABCD:test-secret'

const broadcastHandlers: Record<string, (data: { payload: unknown }) => void> = {}
const mockChannel: any = {
  on: jest.fn((type: string, filter: { event?: string }, handler: (data: unknown) => void) => {
    if (type === 'broadcast' && filter.event) {
      // Pages only act on what the server signed (GHSA-g868-9224-wr3p), so the
      // payloads these tests feed in are sealed on their way to the registry.
      const event = filter.event
      broadcastHandlers[event] = ((data: { payload: unknown }) =>
        handler({ payload: frameFor(REALTIME_TOPIC, event, data.payload) })) as any
    }
    return mockChannel
  }),
  subscribe: jest.fn(() => mockChannel),
}

// One object, not a fresh one per render: the page's loadLobby is a useCallback
// on [code, router], and a router that changes identity every render re-runs
// every effect that depends on it - including the one that loads the lobby.
const mockRouter = {
  replace: mockReplace,
  push: mockPush,
  prefetch: mockPrefetch,
}

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
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

// The realtime topic carries a per-lobby secret and is fetched from the server
// (#845). Supabase itself is mocked below, so the name only has to be stable.
jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))

// The mobile/desktop split is the shared hook, and in jsdom it answers false
// forever - matchMedia reports no match at the 1024px default width. #905 put
// both turn screens behind a tab strip that only exists on a phone, so a test
// that cannot set this covers the desktop layout only.
let mockIsMobileViewport = false
let mockActiveLayout: 'desktop' | 'landscape' | 'mobile' | null = null
jest.mock('@/hooks/useActiveGameLayout', () => ({
  useActiveGameLayout: () => mockActiveLayout,
}))
jest.mock('@/hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mockIsMobileViewport,
}))

let mockBlockedIds: ReadonlySet<string> = new Set()
jest.mock('@/hooks/useBlockedPlayers', () => ({
  useBlockedPlayers: () => ({
    blocked: [],
    blockedIds: mockBlockedIds,
    ready: true,
    failed: false,
    unknown: false,
    retry: () => {},
    block: async () => true,
    unblock: async () => true,
  }),
}))

afterEach(() => {
  mockBlockedIds = new Set()
})

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
      gameType: 'alias',
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
        data: {
          phase: 'team_assignment',
          teams: [
            { id: 'team-1', name: 'Team 1', playerIds: [], score: 0, describerIndex: 0 },
            { id: 'team-2', name: 'Team 2', playerIds: [], score: 0, describerIndex: 0 },
          ],
          currentTeamIndex: 0,
          turnsPerTeam: 3,
          skipPenalty: -1,
          currentCard: null,
          currentCardIndex: 0,
          currentCardResults: [],
          turnStartedAt: null,
          teamTurnCounts: { 'team-1': 0, 'team-2': 0 },
          lastTurnResult: null,
          usedWordIndices: [],
          winnerId: null,
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

describe('AliasLobbyPage', () => {
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

  it('renders the waiting room team assignment screen', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())
  })

  it('shows the try-bot-games banner in the waiting phase when below min players (#780)', async () => {
    const response = buildLobbyResponse()
    response.activeGame.state.data.phase = 'waiting'
    response.activeGame.players = [
      { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
    ]
    ;(response.activeGame as Record<string, unknown>).createdAt = new Date(Date.now() - 2 * 60_000).toISOString()
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response)

    render(<AliasLobbyPage code="ABCD" onGameReset={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('game.ui.tryBotGamesTitle')).toBeInTheDocument()
    })
  })

  it('redirects away when a game-abandoned broadcast is received', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())

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
        { id: 'alias-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('redirects when a player-left broadcast drops below the minimum player count', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-4', username: 'Dave', remainingPlayers: 2 },
      })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('keeps three players in the room, since three is now a game (#847)', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-4', username: 'Dave', remainingPlayers: 3 },
      })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('tells the player who inherits the room that they are now the host (#1089)', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 3, nextCreatorId: 'user-1', nextCreatorName: 'Alice' },
      })
    })

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('toast.youAreNowHost'))
  })

  it('names the new host to everyone else (#1089)', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-waiting-room')).toBeTruthy())

    act(() => {
      broadcastHandlers['player-left']?.({
        payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 3, nextCreatorId: 'user-3', nextCreatorName: 'Carol' },
      })
    })

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('toast.hostReassigned', undefined, { player: 'Carol' }))
    expect(toast.success).not.toHaveBeenCalledWith('toast.youAreNowHost')
  })
})

// #770 — the turn timer effect used to call clearInterval(id) from a
// synchronous first tick(), before `const id = setInterval(...)` on the next
// line was initialized. Opening a lobby whose turn had already expired hit
// that branch immediately and threw "ReferenceError: Cannot access 'i' before
// initialization" (73 Sentry events), killing the page via the error boundary.
describe('AliasLobbyPage turn timer with an already-expired turn (#770)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  function buildExpiredTurnResponse() {
    const base = buildLobbyResponse()
    base.activeGame.status = 'playing'
    base.activeGame.state.status = 'playing'
    base.activeGame.state.data.phase = 'turn_active'
    // Turn started well beyond the 60s turnTimer → first tick computes r === 0
    base.activeGame.state.data.turnStartedAt = Date.now() - 10 * 60 * 1000
    base.activeGame.state.data.currentCard = ['apple', 'pear']
    base.activeGame.state.data.teams[0].playerIds = ['user-1', 'user-2']
    base.activeGame.state.data.teams[1].playerIds = ['user-3', 'user-4']
    base.activeGame.state.players = [
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
      { id: 'user-3', name: 'Carol' },
      { id: 'user-4', name: 'Dave' },
    ]
    return base
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildExpiredTurnResponse(),
    } as Response)
  })

  it('mounts without throwing a ReferenceError', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<AliasLobbyPage code="ABCD" />)).not.toThrow()

    // Let the lobby fetch resolve and the timer effect run its first tick.
    await waitFor(() => expect(mockFetchWithGuest).toHaveBeenCalled())

    const sawTdzError = errorSpy.mock.calls.some((call) =>
      call.some((arg) => String(arg).includes('before initialization'))
    )
    expect(sawTdzError).toBe(false)

    errorSpy.mockRestore()
  })
})

// #1009 — the countdown used to destroy its own interval on the tick where it
// reached zero, so the single lobby GET that followed was the only one this
// client would ever make. The server re-checks the same deadline against the
// same turnStartedAt with its own clock, so a device running ahead of it has
// applyTimeoutFallback refused and gets back the state it already had: deps
// unchanged, interval gone, ring parked at 0 for the rest of the turn.
describe('AliasLobbyPage turn timeout resync (#1009)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  // Fixed for the whole test: a real server hands back the same turn start
  // every time it refuses to move the turn on.
  let stuckTurnStartedAt = 0

  function buildStuckTurnResponse() {
    const base = buildLobbyResponse()
    base.activeGame.status = 'playing'
    base.activeGame.state.status = 'playing'
    base.activeGame.state.data.phase = 'turn_active'
    // Expired well past the 60s turnTimer, and every answer carries the same
    // turnStartedAt: the server is refusing the fallback every time.
    base.activeGame.state.data.turnStartedAt = stuckTurnStartedAt
    base.activeGame.state.data.currentCard = ['apple', 'pear']
    base.activeGame.state.data.teams[0].playerIds = ['user-1', 'user-2']
    base.activeGame.state.data.teams[1].playerIds = ['user-3', 'user-4']
    base.activeGame.state.players = [
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
      { id: 'user-3', name: 'Carol' },
      { id: 'user-4', name: 'Dave' },
    ]
    return base
  }

  // The heartbeat ping goes through the same mock, so count only lobby reads.
  function lobbyGetCount() {
    return mockFetchWithGuest.mock.calls.filter((call) =>
      String(call[0]).includes('/api/lobby/ABCD?')
    ).length
  }

  // The lobby fetch settles on a macrotask, and under the fake clock nothing
  // runs one unless we hold on to the real timer to do it.
  let realSetTimeout: typeof globalThis.setTimeout

  async function flushPendingWork() {
    await act(async () => {
      await new Promise((resolve) => realSetTimeout(resolve, 0))
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildStuckTurnResponse(),
    } as Response)
    realSetTimeout = globalThis.setTimeout
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] })
    stuckTurnStartedAt = Date.now() - 10 * 60 * 1000
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('asks again when the first request leaves the turn where it was', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await flushPendingWork()
    // user-1 describes for team 1, so the expired turn is on screen and the
    // countdown effect has run its first tick.
    expect(screen.getByTestId('alias-describer-screen')).toBeTruthy()

    const afterMount = lobbyGetCount()

    act(() => {
      jest.advanceTimersByTime(10_000)
    })
    await flushPendingWork()

    // The old code asked once more and then destroyed its own interval, so a
    // single extra request is the failure this test exists to catch.
    expect(lobbyGetCount() - afterMount).toBeGreaterThanOrEqual(2)
  })

  it('throttles the retries and then stops asking', async () => {
    render(<AliasLobbyPage code="ABCD" />)
    await flushPendingWork()
    expect(screen.getByTestId('alias-describer-screen')).toBeTruthy()

    // Ten seconds of a turn nothing will move: one request every three seconds,
    // not one on every tick.
    const afterMount = lobbyGetCount()
    act(() => {
      jest.advanceTimersByTime(10_000)
    })
    await flushPendingWork()
    expect(lobbyGetCount() - afterMount).toBeLessThanOrEqual(4)

    act(() => {
      jest.advanceTimersByTime(60_000)
    })
    await flushPendingWork()
    const afterGivingUp = lobbyGetCount()

    act(() => {
      jest.advanceTimersByTime(60_000)
    })
    await flushPendingWork()
    expect(lobbyGetCount()).toBe(afterGivingUp)
  })
})

describe('AliasLobbyPage in-game chrome (#905)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  /**
   * A turn in progress, with the seats shaped the way the API really returns
   * them: a guest Players row carries `name: null` and its display name on the
   * joined user row. Alias read only `name`, which is why the turn line said
   * " is describing for Team 1" against a real lobby.
   */
  function buildTurnResponse({ meDescribing }: { meDescribing: boolean }) {
    const base = buildLobbyResponse()
    base.activeGame.status = 'playing'
    base.activeGame.state.status = 'playing'
    base.activeGame.state.data.phase = 'turn_active'
    base.activeGame.state.data.turnStartedAt = Date.now()
    base.activeGame.state.data.currentCard = ['apple', 'pear']
    base.activeGame.state.data.teams[0].playerIds = meDescribing
      ? ['user-1', 'user-2']
      : ['user-2', 'user-1']
    base.activeGame.state.data.teams[1].playerIds = ['user-3', 'user-4']
    base.activeGame.players = [
      { id: 'player-1', userId: 'user-1', name: null, user: { username: 'Alice' } },
      { id: 'player-2', userId: 'user-2', name: null, user: { username: 'Bob' } },
      { id: 'player-3', userId: 'user-3', name: null, user: { username: 'Carol' } },
      { id: 'player-4', userId: 'user-4', name: null, user: { username: 'Dave' } },
    ]
    return base
  }

  function mountWith(response: ReturnType<typeof buildTurnResponse>) {
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)
    return render(<AliasLobbyPage code="ABCD" />)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  it('puts Leave in the scoreboard header, not at the bottom of the screen', async () => {
    const { container } = mountWith(buildTurnResponse({ meDescribing: true }))
    await waitFor(() => expect(screen.getByTestId('alias-describer-screen')).toBeTruthy())

    // The shared control, in the shared place: the header's actions are where
    // every other game's Leave lives (#1577).
    const leave = container.querySelector('.game-header__actions .game-leave-button')
    expect(leave).toBeTruthy()

    // ...and the old text link under the board is gone.
    expect(screen.queryByText('lobby.game.leaveGame')).toBeNull()
  })

  it('names the describer from the user row when the Players row has no name', async () => {
    const response = buildTurnResponse({ meDescribing: false })
    // On the other team, so the line is about Bob rather than the viewer's own guessing.
    response.activeGame.state.data.teams[0].playerIds = ['user-2', 'user-3']
    response.activeGame.state.data.teams[1].playerIds = ['user-1', 'user-4']
    mountWith(response)
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    // t() is mocked to echo `key:{"...options"}`, so the interpolation values
    // are visible in the rendered text.
    const line = screen.getByText(/game\.ui\.turnPlayer/)
    expect(line.textContent).toBe('game.ui.turnPlayer:{"player":"Bob","action":"alias.doingDescribe"}')
  })

  it('names the two teams in the site language, not by the English name the engine stores (#1481)', async () => {
    const response = buildTurnResponse({ meDescribing: false })
    response.activeGame.state.data.phase = 'team_assignment'
    response.activeGame.state.data.turnStartedAt = null
    response.activeGame.state.data.currentCard = null
    mountWith(response)
    await waitFor(() => expect(screen.getByTestId('alias-team-assignment')).toBeTruthy())

    expect(screen.getAllByText('alias.team1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('alias.team2').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Team \d/)).toBeNull()
  })

  it('names the player who just described on the turn results, not the next describer (#1330)', async () => {
    const response = buildTurnResponse({ meDescribing: false })
    const data = response.activeGame.state.data as Record<string, unknown> & typeof response.activeGame.state.data
    data.phase = 'turn_results'
    data.currentCard = null
    // _endTurn has already moved team 1 on to its next describer, Alice.
    data.teams[0].describerIndex = 1
    data.lastTurnResult = {
      teamId: 'team-1',
      describerId: 'user-2',
      wordResults: [{ word: 'apple', result: 'guessed' }],
      scoreDelta: 1,
      turnIndex: 0,
    } as never
    mountWith(response)
    await waitFor(() => expect(screen.getByTestId('alias-turn-results-screen')).toBeTruthy())

    const label = screen.getByText(/alias\.describerWords/)
    expect(label.textContent).toContain('"name":"Bob"')
  })

  it('keeps the guess feed reachable on the describer screen', async () => {
    mountWith(buildTurnResponse({ meDescribing: true }))
    await waitFor(() => expect(screen.getByTestId('alias-describer-screen')).toBeTruthy())
    expect(screen.getByText('alias.guesses')).toBeTruthy()
  })

  it('names guests on the team screen, not by a cut user id (#1283)', async () => {
    const response = buildTurnResponse({ meDescribing: false })
    response.activeGame.state.data.phase = 'team_assignment'
    response.activeGame.state.data.turnStartedAt = null
    response.activeGame.state.data.currentCard = null
    mountWith(response)
    await waitFor(() => expect(screen.getByTestId('alias-team-assignment')).toBeTruthy())

    for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    }
    expect(screen.queryByText('user-2')).toBeNull()
  })
})

describe('AliasLobbyPage mobile turn tabs (#905 review)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  function buildTurnResponse({ meDescribing }: { meDescribing: boolean }) {
    const base = buildLobbyResponse()
    base.activeGame.status = 'playing'
    base.activeGame.state.status = 'playing'
    base.activeGame.state.data.phase = 'turn_active'
    base.activeGame.state.data.turnStartedAt = Date.now()
    base.activeGame.state.data.currentCard = ['apple', 'pear']
    base.activeGame.state.data.teams[0].playerIds = meDescribing
      ? ['user-1', 'user-2']
      : ['user-2', 'user-1']
    base.activeGame.state.data.teams[1].playerIds = ['user-3', 'user-4']
    return base
  }

  function mountWith(response: ReturnType<typeof buildTurnResponse>) {
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)
    return render(<AliasLobbyPage code="ABCD" />)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockIsMobileViewport = true
  })

  afterEach(() => {
    mockIsMobileViewport = false
  })

  /**
   * The guesser's only action in Alias is typing the guess, and on a phone the
   * chat is mounted on one tab and absent from the other - a conditional
   * render, not display:none. #905 defaulted both roles to the word tab, which
   * left the guesser looking at "Listen up - type your guess in the chat" with
   * no input anywhere in the document. The tab now follows the role.
   */
  it('gives the guesser the guess input on the tab they land on', async () => {
    mountWith(buildTurnResponse({ meDescribing: false }))
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    expect(screen.getByPlaceholderText('alias.guessPlaceholder')).toBeTruthy()
  })

  // GHSA-g868-9224-wr3p: guesses went client to client on the lobby topic, so
  // anyone holding it could post one under another player's name. They now go
  // through the server, which broadcasts them signed with the sender's name.
  it('sends a guess through the server and shows the ones the server relays', async () => {
    // jsdom has no scrollIntoView; the feed scrolls to the newest guess.
    Element.prototype.scrollIntoView = jest.fn()
    mountWith(buildTurnResponse({ meDescribing: false }))
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('alias.guessPlaceholder'), { target: { value: 'banana' } })
    fireEvent.keyDown(screen.getByPlaceholderText('alias.guessPlaceholder'), { key: 'Enter' })

    await waitFor(() => {
      expect(mockFetchWithGuest).toHaveBeenCalledWith(
        '/api/lobby/ABCD/alias-guess',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'banana' }) })
      )
    })
    expect(screen.getByText('banana')).toBeTruthy()

    act(() => {
      broadcastHandlers['chat-message']?.({
        payload: { id: 'g-1', userId: 'user-3', username: 'Carol', message: 'apple', type: 'alias-guess', lobbyCode: 'ABCD' },
      })
    })
    await waitFor(() => expect(screen.getByText('apple')).toBeTruthy())
  })

  // #1466 review: the lobby topic carries chat too; only the server's alias-guess frames are guesses.
  it('shows only guesses in the guess feed, not other chat frames on the lobby topic', async () => {
    Element.prototype.scrollIntoView = jest.fn()
    mountWith(buildTurnResponse({ meDescribing: false }))
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    act(() => {
      broadcastHandlers['chat-message']?.({
        payload: { id: 'c-1', userId: 'user-3', username: 'Carol', message: 'lobby chatter', type: 'message', lobbyCode: 'ABCD' },
      })
      broadcastHandlers['chat-message']?.({
        payload: { id: 'c-2', userId: 'user-4', username: 'Dan', message: 'untyped chatter', lobbyCode: 'ABCD' },
      })
      broadcastHandlers['chat-message']?.({
        payload: { id: 'g-2', userId: 'user-3', username: 'Carol', message: 'pear', type: 'alias-guess', lobbyCode: 'ABCD' },
      })
    })

    await waitFor(() => expect(screen.getByText('pear')).toBeTruthy())
    expect(screen.queryByText('lobby chatter')).toBeNull()
    expect(screen.queryByText('untyped chatter')).toBeNull()
  })

  it('folds a guess from a blocked player to one line under their name', async () => {
    Element.prototype.scrollIntoView = jest.fn()
    mockBlockedIds = new Set(['user-3'])
    mountWith(buildTurnResponse({ meDescribing: false }))
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    act(() => {
      broadcastHandlers['chat-message']?.({
        payload: { id: 'g-3', userId: 'user-3', username: 'Carol', message: 'meanie', type: 'alias-guess', lobbyCode: 'ABCD' },
      })
      broadcastHandlers['chat-message']?.({
        payload: { id: 'g-4', userId: 'user-4', username: 'Dan', message: 'pear', type: 'alias-guess', lobbyCode: 'ABCD' },
      })
    })

    await waitFor(() => expect(screen.getByText('pear')).toBeTruthy())
    expect(screen.queryByText('meanie')).toBeNull()
    expect(screen.getByText('Carol')).toBeTruthy()
    expect(screen.getByText('blockedPlayers.hiddenText')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'blockedPlayers.show' }))
    expect(screen.getByText('meanie')).toBeTruthy()
  })

  it('takes a rate-limited guess back and says why, instead of dropping it silently', async () => {
    Element.prototype.scrollIntoView = jest.fn()
    const response = buildTurnResponse({ meDescribing: false })
    mockFetchWithGuest.mockImplementation(async (url) => {
      if (String(url).endsWith('/alias-guess')) {
        return { ok: false, status: 429, json: async () => ({ error: 'Too many guesses' }) } as Response
      }
      return { ok: true, status: 200, json: async () => response } as Response
    })
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())
    const toast = showToast as jest.Mocked<typeof showToast>

    fireEvent.change(screen.getByPlaceholderText('alias.guessPlaceholder'), { target: { value: 'banana' } })
    fireEvent.keyDown(screen.getByPlaceholderText('alias.guessPlaceholder'), { key: 'Enter' })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'alias.guessRateLimited',
        undefined,
        undefined,
        expect.objectContaining({ id: 'alias-guess-rate-limited' })
      )
    })
    expect(screen.queryByText('banana')).toBeNull()
  })

  // #1466: a guess is free text shown to the whole lobby, so it waits for the terms like chat.
  it('asks for the terms when a guess is refused for them, keeps the guess, and sends it once accepted', async () => {
    Element.prototype.scrollIntoView = jest.fn()
    const response = buildTurnResponse({ meDescribing: false })
    let termsAccepted = false
    mockFetchWithGuest.mockImplementation(async (url) => {
      if (String(url).endsWith('/alias-guess')) {
        return termsAccepted
          ? ({ ok: true, status: 200, json: async () => ({}) } as Response)
          : ({ ok: false, status: 403, json: async () => ({ code: 'TERMS_REQUIRED' }) } as Response)
      }
      if (String(url) === '/api/user/accept-terms') {
        termsAccepted = true
        return { ok: true, status: 200, json: async () => ({ termsAcceptedAt: '2026-10-18T12:00:00.000Z' }) } as Response
      }
      return { ok: true, status: 200, json: async () => response } as Response
    })
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('alias.guessPlaceholder'), { target: { value: 'banana' } })
    fireEvent.keyDown(screen.getByPlaceholderText('alias.guessPlaceholder'), { key: 'Enter' })

    const accept = await screen.findByRole('button', { name: 'chat.termsAcceptPlay' })
    expect(screen.getByText('chat.termsPromptPlay')).toBeTruthy()
    expect(screen.queryByPlaceholderText('alias.guessPlaceholder')).toBeNull()
    expect(screen.queryByText('banana')).toBeNull()

    fireEvent.click(accept)
    const input = (await screen.findByPlaceholderText('alias.guessPlaceholder')) as HTMLInputElement
    expect(mockFetchWithGuest).toHaveBeenCalledWith('/api/user/accept-terms', expect.objectContaining({ method: 'POST' }))
    expect(input.value).toBe('banana')

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockFetchWithGuest.mock.calls.filter(([url]) => String(url).endsWith('/alias-guess'))).toHaveLength(2)
    })
    expect(screen.getByText('banana')).toBeTruthy()
    expect(screen.queryByText('chat.termsPromptPlay')).toBeNull()
  })

  it('keeps a refused guess and what was typed after it, in that order', async () => {
    Element.prototype.scrollIntoView = jest.fn()
    const response = buildTurnResponse({ meDescribing: false })
    let refuseGuess: () => void = () => {}
    mockFetchWithGuest.mockImplementation(async (url) => {
      if (String(url).endsWith('/alias-guess')) {
        return new Promise((resolve) => {
          refuseGuess = () => resolve({ ok: false, status: 403, json: async () => ({ code: 'TERMS_REQUIRED' }) } as Response)
        })
      }
      if (String(url) === '/api/user/accept-terms') {
        return { ok: true, status: 200, json: async () => ({ termsAcceptedAt: '2026-10-18T12:00:00.000Z' }) } as Response
      }
      return { ok: true, status: 200, json: async () => response } as Response
    })
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    const input = screen.getByPlaceholderText('alias.guessPlaceholder')
    fireEvent.change(input, { target: { value: 'banana' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'apple' } })
    await act(async () => refuseGuess())

    fireEvent.click(await screen.findByRole('button', { name: 'chat.termsAcceptPlay' }))
    expect(((await screen.findByPlaceholderText('alias.guessPlaceholder')) as HTMLInputElement).value).toBe('banana apple')
  })

  it('leaves the describer on the word card, with the feed one tap away', async () => {
    mountWith(buildTurnResponse({ meDescribing: true }))
    await waitFor(() => expect(screen.getByTestId('alias-describer-screen')).toBeTruthy())

    // The describer acts on the word, so the card and Correct/Skip are the
    // landing tab and the read-only feed is behind the other one.
    expect(screen.getByText('apple')).toBeTruthy()
    const wordTab = screen.getByRole('button', { name: 'game.ui.tabBoard' })
    const guessesTab = screen.getByRole('button', { name: 'alias.guesses' })
    expect(wordTab.className).toContain('game-tab-active')
    expect(guessesTab.className).not.toContain('game-tab-active')

    // ...and tapping the other tab still works, for the turn it was tapped on.
    await act(async () => {
      guessesTab.click()
    })
    expect(screen.getByRole('button', { name: 'alias.guesses' }).className).toContain('game-tab-active')
    expect(screen.getByRole('button', { name: 'game.ui.tabBoard' }).className).not.toContain('game-tab-active')
  })

  /**
   * A tab that outlives the turn it was tapped on is the other half of this:
   * a describer who read the feed came back next turn to a screen with the
   * word card under display:none and nothing to act on. The tap is scoped to
   * the turn, so a new turn lands on the role's own tab again.
   */
  it('drops a tapped tab when the next turn starts', async () => {
    const first = buildTurnResponse({ meDescribing: true })
    mountWith(first)
    await waitFor(() => expect(screen.getByTestId('alias-describer-screen')).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: 'alias.guesses' }).click()
    })
    expect(screen.getByRole('button', { name: 'alias.guesses' }).className).toContain('game-tab-active')

    const nextTurn = buildTurnResponse({ meDescribing: true })
    nextTurn.activeGame.state.data.turnStartedAt = Number(first.activeGame.state.data.turnStartedAt) + 90_000
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => nextTurn } as Response)
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: {} })
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'game.ui.tabBoard' }).className).toContain('game-tab-active')
    )
    expect(screen.getByRole('button', { name: 'alias.guesses' }).className).not.toContain('game-tab-active')
  })
})

describe('AliasLobbyPage key buttons on a phone', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  function mountWith(mutate: (base: ReturnType<typeof buildLobbyResponse>) => void) {
    const base = buildLobbyResponse()
    base.activeGame.status = 'playing'
    base.activeGame.state.status = 'playing'
    base.activeGame.state.data.teams[0].playerIds = ['user-1', 'user-2']
    base.activeGame.state.data.teams[1].playerIds = ['user-3', 'user-4']
    mutate(base)
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => base } as Response)
    return render(<AliasLobbyPage code="ABCD" />)
  }

  const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockIsMobileViewport = true
  })

  afterEach(() => {
    mockIsMobileViewport = false
  })

  it('puts Guessed and Skip straight under the word, pinned while the rest scrolls', async () => {
    mountWith((base) => {
      base.activeGame.state.data.phase = 'turn_active'
      base.activeGame.state.data.turnStartedAt = Date.now()
      base.activeGame.state.data.currentCard = ['apple', 'pear']
    })
    await waitFor(() => expect(screen.getByTestId('alias-describer-screen')).toBeTruthy())

    const actions = screen.getByLabelText('alias.guessedCorrectly').parentElement!
    expect(actions.style.position).toBe('sticky')
    expect(follows(screen.getByText('alias.theSecretWord'), actions)).toBe(true)
    expect(follows(actions, screen.getByText('alias.thisTurnSoFar'))).toBe(true)
    expect(screen.queryByText('alias.youAreDescribing')).toBeNull()
  })

  it('shows Play Again before the final score card', async () => {
    mountWith((base) => {
      base.activeGame.status = 'finished'
      base.activeGame.state.status = 'finished'
      base.activeGame.state.data.phase = 'game_over'
      base.activeGame.state.data.winnerId = 'tie'
    })
    await waitFor(() => expect(screen.getByTestId('alias-game-over-screen')).toBeTruthy())

    expect(follows(screen.getByText('alias.playAgain'), screen.getAllByText('alias.team1').at(-1)!)).toBe(true)
  })
})

describe('AliasLobbyPage phone landscape (#1384)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  function buildTurnResponse({ meDescribing }: { meDescribing: boolean }) {
    const base = buildLobbyResponse()
    base.activeGame.status = 'playing'
    base.activeGame.state.status = 'playing'
    base.activeGame.state.data.phase = 'turn_active'
    base.activeGame.state.data.turnStartedAt = Date.now()
    base.activeGame.state.data.currentCard = ['apple', 'pear']
    base.activeGame.state.data.teams[0].playerIds = meDescribing ? ['user-1', 'user-2'] : ['user-2', 'user-1']
    base.activeGame.state.data.teams[1].playerIds = ['user-3', 'user-4']
    return base
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    mockIsMobileViewport = true
    mockActiveLayout = 'landscape'
  })

  afterEach(() => {
    mockIsMobileViewport = false
    mockActiveLayout = null
  })

  it('lays the describer out as a board pane and a side column, with no tab strip', async () => {
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildTurnResponse({ meDescribing: true }) } as Response)
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-describer-screen')).toBeTruthy())

    const layout = screen.getByTestId('alias-landscape-layout')
    const board = layout.querySelector('.game-landscape-board') as HTMLElement
    const side = layout.querySelector('.game-landscape-side') as HTMLElement
    expect(board.textContent).toContain('apple')
    expect(board.querySelector('[aria-label="alias.guessedCorrectly"]')).toBeTruthy()
    expect(board.querySelector('[aria-label="alias.skipWord"]')).toBeTruthy()
    expect(side.querySelector('.alias-header-card')).toBeTruthy()
    expect(side.querySelector('.alias-status-slot')).toBeTruthy()
    expect(screen.queryByText('game.ui.tabBoard')).toBeNull()
  })

  it('gives the guesser the guess input in the side column', async () => {
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => buildTurnResponse({ meDescribing: false }) } as Response)
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    const side = screen.getByTestId('alias-landscape-layout').querySelector('.game-landscape-side') as HTMLElement
    expect(side.querySelector('input[placeholder="alias.guessPlaceholder"]')).toBeTruthy()
    expect(screen.queryByText('game.ui.tabBoard')).toBeNull()
  })
})

// #1521: every move's broadcast makes the page ask for the lobby again, and on
// a slow server that answer can be older than the card already on screen.
describe('AliasLobbyPage – an older answer never replaces the card on screen (#1521)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const WORDS = ['lantern', 'guitar', 'sandals', 'kettle', 'mirror', 'violin', 'pillow', 'rocket', 'tunnel', 'garden']
  let T0 = 0
  let turnStartedAt = 0

  function snapshotAt(cardIndex: number, lastMoveAt: number) {
    const base = buildLobbyResponse()
    base.activeGame.status = 'playing'
    const state = base.activeGame.state as Record<string, any>
    state.status = 'playing'
    state.lastMoveAt = lastMoveAt
    state.players = [
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
      { id: 'user-3', name: 'Carol' },
      { id: 'user-4', name: 'Dave' },
    ]
    state.data.phase = 'turn_active'
    state.data.turnStartedAt = turnStartedAt
    state.data.currentCard = WORDS
    state.data.currentCardIndex = cardIndex
    state.data.currentCardResults = WORDS.slice(0, cardIndex).map((word) => ({ word, result: 'guessed' }))
    state.data.teams[0].playerIds = ['user-1', 'user-2']
    state.data.teams[1].playerIds = ['user-3', 'user-4']
    return base
  }

  type Held = { resolve: (status: number, body: unknown) => void }
  let lobbyReads: Held[]
  let moves: Held[]

  function hold(queue: Held[]) {
    return new Promise<Response>((resolve) => {
      queue.push({
        resolve: (status, body) => resolve({ ok: status < 400, status, json: async () => body } as Response),
      })
    })
  }

  const card = () => screen.getByTestId('alias-secret-word').textContent
  const tapGuessed = () => fireEvent.click(screen.getByRole('button', { name: 'alias.guessedCorrectly' }))

  // What POST /api/game/[gameId]/state broadcasts: the state itself, with the card hidden.
  function broadcastMove(lastMoveAt: number) {
    const state = snapshotAt(0, lastMoveAt).activeGame.state as Record<string, any>
    broadcastHandlers['game-update']?.({
      payload: { action: 'state-change', gameId: 'game-1', payload: { ...state, data: { ...state.data, currentCard: null } } },
    })
  }

  async function mountOnFirstWord() {
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(lobbyReads).toHaveLength(1))
    await act(async () => lobbyReads[0].resolve(200, snapshotAt(0, T0)))
    await waitFor(() => expect(card()).toBe('lantern'))
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
    turnStartedAt = Date.now()
    T0 = turnStartedAt - 1_000
    lobbyReads = []
    moves = []
    mockFetchWithGuest.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url)
      if (target.startsWith('/api/lobby/ABCD?')) return hold(lobbyReads)
      if (target === '/api/game/game-1/state' && init?.method === 'POST') return hold(moves)
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)
    })
  })

  it('keeps the next word when a lobby answer from before the tap lands while the move is in flight', async () => {
    await mountOnFirstWord()

    await act(async () => broadcastMove(T0))
    await waitFor(() => expect(lobbyReads).toHaveLength(2))

    tapGuessed()
    await waitFor(() => expect(moves).toHaveLength(1))
    expect(card()).toBe('guitar')

    await act(async () => lobbyReads[1].resolve(200, snapshotAt(0, T0)))
    expect(card()).toBe('guitar')

    await act(async () => moves[0].resolve(200, { game: { state: snapshotAt(1, T0 + 1_000).activeGame.state } }))
    expect(card()).toBe('guitar')
  })

  it('keeps the next word when the move is answered first and the older lobby answer arrives last', async () => {
    await mountOnFirstWord()

    await act(async () => broadcastMove(T0))
    await waitFor(() => expect(lobbyReads).toHaveLength(2))

    tapGuessed()
    await waitFor(() => expect(moves).toHaveLength(1))
    await act(async () => moves[0].resolve(200, { game: { state: snapshotAt(1, T0 + 1_000).activeGame.state } }))
    expect(card()).toBe('guitar')

    await act(async () => lobbyReads[1].resolve(200, snapshotAt(0, T0)))
    expect(card()).toBe('guitar')
  })

  it('keeps the newer card when two lobby answers cross and the older one lands last', async () => {
    await mountOnFirstWord()

    await act(async () => broadcastMove(T0))
    await act(async () => broadcastMove(T0 + 1_000))
    await waitFor(() => expect(lobbyReads).toHaveLength(3))

    await act(async () => lobbyReads[2].resolve(200, snapshotAt(1, T0 + 1_000)))
    expect(card()).toBe('guitar')

    await act(async () => lobbyReads[1].resolve(200, snapshotAt(0, T0)))
    expect(card()).toBe('guitar')
  })

  it('still takes a lobby answer that changed the turn without a new move stamp', async () => {
    await mountOnFirstWord()

    await act(async () => broadcastMove(T0))
    await waitFor(() => expect(lobbyReads).toHaveLength(2))

    // The timeout fallback ends the turn on the server without restamping lastMoveAt.
    const timedOut = snapshotAt(0, T0)
    const data = (timedOut.activeGame.state as Record<string, any>).data
    data.phase = 'turn_results'
    data.lastTurnResult = { teamId: 'team-1', describerId: 'user-1', wordResults: [], scoreDelta: 0, turnIndex: 0 }
    await act(async () => lobbyReads[1].resolve(200, timedOut))

    await waitFor(() => expect(screen.getByTestId('alias-turn-results-screen')).toBeTruthy())
  })

  it('puts the word back when the server refuses the move', async () => {
    await mountOnFirstWord()

    tapGuessed()
    await waitFor(() => expect(moves).toHaveLength(1))
    expect(card()).toBe('guitar')

    await act(async () => moves[0].resolve(409, { code: 'STATE_CONFLICT' }))
    await waitFor(() => expect(lobbyReads).toHaveLength(2))
    await act(async () => lobbyReads[1].resolve(200, snapshotAt(0, T0)))

    await waitFor(() => expect(card()).toBe('lantern'))
  })

  // Every client asks at 0:00; a timeout write that loses its row check answers with the state
  // from before the timeout under the same lastMoveAt, and that answer can land last.
  it('stays on the turn results when the read from before the timeout lands after them', async () => {
    await mountOnFirstWord()

    await act(async () => broadcastMove(T0))
    await act(async () => broadcastMove(T0))
    await waitFor(() => expect(lobbyReads).toHaveLength(3))

    const beforeTimeout = snapshotAt(0, T0)
    ;(beforeTimeout.activeGame.state as Record<string, any>).updatedAt = new Date(T0).toISOString()
    const afterTimeout = snapshotAt(0, T0)
    const timedOut = afterTimeout.activeGame.state as Record<string, any>
    timedOut.updatedAt = new Date(T0 + 60_000).toISOString()
    timedOut.data.phase = 'turn_results'
    timedOut.data.lastTurnResult = { teamId: 'team-1', describerId: 'user-1', wordResults: [], scoreDelta: 0, turnIndex: 0 }

    await act(async () => lobbyReads[2].resolve(200, afterTimeout))
    await waitFor(() => expect(screen.getByTestId('alias-turn-results-screen')).toBeTruthy())

    await act(async () => lobbyReads[1].resolve(200, beforeTimeout))
    expect(screen.getByTestId('alias-turn-results-screen')).toBeTruthy()
  })

  it('keeps the lobby from the newer answer when an older one, naming the previous host, lands last', async () => {
    const teamsAt = (lastMoveAt: number, creatorId: string) => {
      const base = buildLobbyResponse()
      base.lobby.creatorId = creatorId
      base.activeGame.status = 'playing'
      const state = base.activeGame.state as Record<string, any>
      state.status = 'playing'
      state.lastMoveAt = lastMoveAt
      state.data.teams[0].playerIds = ['user-1', 'user-2']
      state.data.teams[1].playerIds = ['user-3', 'user-4']
      return base
    }
    render(<AliasLobbyPage code="ABCD" />)
    await waitFor(() => expect(lobbyReads).toHaveLength(1))
    await act(async () => lobbyReads[0].resolve(200, teamsAt(T0, 'user-2')))
    await waitFor(() => expect(screen.getByTestId('alias-team-assignment')).toBeTruthy())
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())
    expect(screen.queryByText('alias.startRounds')).toBeNull()

    await act(async () => broadcastMove(T0))
    await act(async () => broadcastMove(T0 + 1_000))
    await waitFor(() => expect(lobbyReads).toHaveLength(3))

    await act(async () => lobbyReads[2].resolve(200, teamsAt(T0 + 1_000, 'user-1')))
    await waitFor(() => expect(screen.getByText('alias.startRounds')).toBeTruthy())

    await act(async () => lobbyReads[1].resolve(200, teamsAt(T0, 'user-2')))
    expect(screen.getByText('alias.startRounds')).toBeTruthy()
  })

  it('lets the describer tap again after the optimistic card could not be drawn', async () => {
    await mountOnFirstWord()
    const draw = jest.spyOn(AliasGame.prototype, 'processMove').mockImplementationOnce(() => {
      throw new Error('optimistic card failed')
    })

    tapGuessed()
    await waitFor(() => expect(lobbyReads).toHaveLength(2))
    await act(async () => lobbyReads[1].resolve(200, snapshotAt(0, T0)))
    draw.mockRestore()

    tapGuessed()
    await waitFor(() => expect(moves).toHaveLength(1))
  })
})
