// @ts-nocheck
import { act, render, screen, waitFor } from '@testing-library/react'
import AliasLobbyPage from '@/app/lobby/[code]/alias-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

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

jest.mock('@/components/ReactionOverlay', () => ({
  __esModule: true,
  default: () => null,
  // alias-page imports the named export, and only renders it once the game is
  // active — the waiting-room tests never hit it, the #770 test does.
  ReactionOverlay: () => null,
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
jest.mock('@/hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => mockIsMobileViewport,
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

    // The shared control, in the shared place: GameScoreboardHeader's right
    // cell is where every other game's Leave lives (layout DoD 2026-09-06).
    const leave = container.querySelector('.game-scoreboard-cell--right .game-leave-button')
    expect(leave).toBeTruthy()

    // ...and the old text link under the board is gone.
    expect(screen.queryByText('lobby.game.leaveGame')).toBeNull()
  })

  it('names the describer from the user row when the Players row has no name', async () => {
    mountWith(buildTurnResponse({ meDescribing: false }))
    await waitFor(() => expect(screen.getByTestId('alias-guesser-screen')).toBeTruthy())

    // t() is mocked to echo `key:{"...options"}`, so the interpolation values
    // are visible in the rendered text.
    const line = screen.getByText(/alias\.describerTurnLine/)
    expect(line.textContent).toContain('"name":"Bob"')
    expect(line.textContent).toContain('"team":"Team 1"')
  })

  it('keeps the guess feed reachable on the describer screen', async () => {
    mountWith(buildTurnResponse({ meDescribing: true }))
    await waitFor(() => expect(screen.getByTestId('alias-describer-screen')).toBeTruthy())
    expect(screen.getByText('alias.guesses')).toBeTruthy()
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
