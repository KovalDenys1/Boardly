// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/lobby/[code]/tic-tac-toe-page'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { playCue } from '@/lib/sound-engine'
import { frameFor, installSignedRealtime, settleRealtime } from '@/__tests__/fixtures/signed-realtime'

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

// Next's router is the same object on every render; a fresh one per render
// would re-run every effect that depends on it, loadLobby's included.
jest.mock('next/navigation', () => {
  const router = {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
    prefetch: (...args: unknown[]) => mockPrefetch(...args),
  }
  return { useRouter: () => router }
})

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

jest.mock('@/lib/sound-engine', () => ({
  ...jest.requireActual('@/lib/sound-engine'),
  playCue: jest.fn(() => true),
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

function buildLobbyResponse() {
  const engine = new TicTacToeGame('game-1')
  engine.addPlayer({
    id: 'user-1',
    name: 'Alice',
    score: 0,
    isActive: true,
  })
  engine.addPlayer({
    id: 'user-2',
    name: 'Bob',
    score: 0,
    isActive: true,
  })
  engine.startGame()

  const activeGame = {
    id: 'game-1',
    status: 'playing',
    currentTurn: 0,
    state: engine.getState(),
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
  }

  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'tic_tac_toe',
      creatorId: 'user-1',
      name: 'Lobby',
      isActive: false,
    },
    activeGame,
  }
}

/** Two moves played, back on user-1's turn, with `requesterId` waiting on an answer. */
function buildLobbyResponseWithDrawOffer(requesterId: string) {
  const response = buildLobbyResponse()
  const engine = new TicTacToeGame('game-1')
  engine.restoreState(response.activeGame.state)

  engine.makeMove({ playerId: 'user-1', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
  engine.makeMove({ playerId: 'user-2', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
  engine.makeMove({ playerId: requesterId, type: 'request-draw', data: {}, timestamp: new Date() })

  response.activeGame.state = engine.getState()
  return response
}

describe('TicTacToeLobbyPage', () => {
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
    render(<TicTacToeLobbyPage code="ABCD" />)

    await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())

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
        { id: 'ttt-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('shows active match controls including undo, draw, and leave lobby', async () => {
    render(<TicTacToeLobbyPage code="ABCD" />)

    expect((await screen.findAllByRole('button', { name: /undo/i })).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /draw/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'game.ui.leave' }).length).toBeGreaterThan(0)
  })

  it('hides the undo and draw requests in a game against a bot (#1352)', async () => {
    const response = buildLobbyResponse()
    response.activeGame.players[1].user = { username: 'Bob', bot: { difficulty: 'easy' } }
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

    render(<TicTacToeLobbyPage code="ABCD" />)

    expect((await screen.findAllByRole('button', { name: 'game.ui.leave' })).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: /undo/i })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: /draw/i })).toHaveLength(0)
  })

  describe("the finished banner names the viewer's result (#1340)", () => {
    /** X (user-1, the viewer) takes the top row, or O (user-2) takes the middle row. */
    function finishedResponse(winner: 'user-1' | 'user-2') {
      const response = buildLobbyResponse()
      const engine = new TicTacToeGame('game-1')
      engine.restoreState(response.activeGame.state)
      const moves: Array<[string, number, number]> = winner === 'user-1'
        ? [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 0, 1], ['user-2', 1, 1], ['user-1', 0, 2]]
        : [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 2, 2], ['user-2', 1, 1], ['user-1', 0, 2], ['user-2', 1, 2]]
      for (const [playerId, row, col] of moves) {
        engine.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })
      }
      response.activeGame.state = engine.getState()
      response.activeGame.status = engine.getState().status
      return response
    }

    it.each([
      ['user-1', 'win', 'game.ui.victoryBadge'],
      ['user-2', 'loss', 'game.ui.defeatBadge'],
    ] as const)('when %s wins the viewer sees %s', async (winner, outcome, badge) => {
      const response = finishedResponse(winner)
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => response } as Response)

      render(<TicTacToeLobbyPage code="ABCD" />)

      const titles = await screen.findAllByTestId('game-status-title')
      expect(titles.every((el) => el.getAttribute('data-outcome') === outcome)).toBe(true)
      expect(titles[0].textContent).toContain(badge)
    })

    describe('a spectator hears the end of the game (#1464)', () => {
      const resultCues = () => (playCue as jest.Mock).mock.calls.filter(([cue]) => String(cue).startsWith('result.'))

      it('plays result.over once when the game finishes while they watch', async () => {
        render(<TicTacToeLobbyPage code="ABCD" isSpectator />)
        await screen.findAllByTestId('game-status-title')

        mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => finishedResponse('user-1') } as Response)
        act(() => {
          broadcastHandlers['game-update']?.({ payload: {} })
        })
        await waitFor(() => expect(resultCues()).toEqual([['result.over', { gameId: expect.stringMatching(/^game-1#1:\d+$/), delayMs: 700 }]]))
        expect(screen.queryByTestId('game-result-overlay')).toBeNull()
      })

      it('stays silent for a spectator who opens a game that has already finished', async () => {
        mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => finishedResponse('user-1') } as Response)
        render(<TicTacToeLobbyPage code="ABCD" isSpectator />)
        await screen.findAllByTestId('game-status-title')

        expect(resultCues()).toEqual([])
      })
    })
  })

  describe('an unanswered draw offer (#997)', () => {
    it('leaves the board playable for the player who made the offer', async () => {
      const response = buildLobbyResponseWithDrawOffer('user-1')
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => response,
      } as Response)

      render(<TicTacToeLobbyPage code="ABCD" />)

      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
      // Playing on withdraws the offer, so the opponent ignoring it cannot pin
      // the requester on a board they are not allowed to touch.
      screen.getAllByRole('button', { name: 'cell C3' }).forEach((cell) => {
        expect(cell.disabled).toBe(false)
      })
    })

    it('holds the board for the player who has to answer it', async () => {
      const response = buildLobbyResponseWithDrawOffer('user-2')
      mockFetchWithGuest.mockResolvedValue({
        ok: true,
        json: async () => response,
      } as Response)

      render(<TicTacToeLobbyPage code="ABCD" />)

      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
      screen.getAllByRole('button', { name: 'cell C3' }).forEach((cell) => {
        expect(cell.disabled).toBe(true)
      })
    })
  })

  describe('a mark answered slowly by the server (#1288)', () => {
    it('pops once: the server copy of a settled mark does not pop again', async () => {
      render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())

      let answerMove: (response: Response) => void = () => {}
      mockFetchWithGuest.mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/state') && init?.method === 'POST') {
          return new Promise<Response>((resolve) => { answerMove = resolve })
        }
        return { ok: true, json: async () => buildLobbyResponse() } as Response
      })

      fireEvent.click(screen.getAllByRole('button', { name: 'cell A1' })[0])
      const popHosts = () => document.querySelectorAll('.ttt-mark-pop-host')
      await waitFor(() => expect(popHosts().length).toBeGreaterThan(0))
      popHosts().forEach((host) => fireEvent.animationEnd(host))
      expect(popHosts()).toHaveLength(0)

      const server = new TicTacToeGame('game-1')
      server.restoreState(buildLobbyResponse().activeGame.state)
      server.makeMove({ playerId: 'user-1', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date(Date.now() + 600) })
      await act(async () => {
        answerMove({ ok: true, status: 200, json: async () => ({ game: { state: server.getState(), status: 'playing' } }) } as Response)
      })

      await waitFor(() => expect(mockFetchWithGuest).toHaveBeenCalledWith('/api/game/game-1/state', expect.anything()))
      expect(popHosts()).toHaveLength(0)
    })
  })

  // #1521: a lobby read that left before the move and is answered after it
  // carries the board from before the move; it used to be applied as trusted.
  describe('a lobby answer older than the board on screen (#1521)', () => {
    it('keeps the mark when the lobby answer from before the move lands after the move answer', async () => {
      const before = buildLobbyResponse()
      mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => before } as Response)
      render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
      await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())

      let answerLobby: (response: Response) => void = () => {}
      let answerMove: (response: Response) => void = () => {}
      mockFetchWithGuest.mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/state') && init?.method === 'POST') {
          return new Promise<Response>((resolve) => { answerMove = resolve })
        }
        if (String(url).startsWith('/api/lobby/ABCD?')) {
          return new Promise<Response>((resolve) => { answerLobby = resolve })
        }
        return { ok: true, json: async () => ({}) } as Response
      })

      // An update with no state on it sends the page to read the lobby; that read is slow.
      await act(async () => {
        broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } })
      })
      await waitFor(() => expect(mockFetchWithGuest).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/lobby\/ABCD\?/), expect.anything()))

      const cellA1 = () => screen.getAllByRole('button', { name: 'cell A1' })[0]
      fireEvent.click(cellA1())
      await waitFor(() => expect(cellA1().querySelector('.ttt-cell-coord')).toBeNull())

      const server = new TicTacToeGame('game-1')
      server.restoreState(before.activeGame.state)
      server.makeMove({ playerId: 'user-1', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
      const afterMove = server.getState() as { lastMoveAt?: number }
      afterMove.lastMoveAt = (before.activeGame.state.lastMoveAt as number) + 1_000
      await act(async () => {
        answerMove({ ok: true, status: 200, json: async () => ({ game: { state: afterMove, status: 'playing' } }) } as Response)
      })
      expect(cellA1().querySelector('.ttt-cell-coord')).toBeNull()

      await act(async () => {
        answerLobby({ ok: true, status: 200, json: async () => before } as Response)
      })
      expect(cellA1().querySelector('.ttt-cell-coord')).toBeNull()
    })
  })
})

function finishedRound1() {
  const response = buildLobbyResponse()
  const engine = new TicTacToeGame('game-1')
  engine.restoreState(response.activeGame.state)
  const moves: Array<[string, number, number]> = [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 0, 1], ['user-2', 1, 1], ['user-1', 0, 2]]
  for (const [playerId, row, col] of moves) {
    engine.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })
  }
  response.activeGame.state = engine.getState()
  response.activeGame.status = engine.getState().status
  return response
}

// #1521 review: a lobby read that left during round 1 and lands in round 2 is older than the board;
// dropping its board is not enough – its 'finished' status must not come back either.
describe('TicTacToeLobbyPage – an older lobby answer from a finished round (#1521)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  it('does not put the round-1 result back over round 2 after next-round', async () => {
    const finished = finishedRound1()
    expect(finished.activeGame.status).toBe('finished')
    const T1 = finished.activeGame.state.lastMoveAt as number
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => finished } as Response)
    render(<TicTacToeLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())

    // A lobby read leaves while round 1 is over (any update with no state on it does this).
    let answerLobby: ((r: Response) => void) | null = null
    mockFetchWithGuest.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { answerLobby = resolve })
      return { ok: true, json: async () => ({}) } as Response
    })
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } })
    })
    await waitFor(() => expect(answerLobby).not.toBeNull())

    // The opponent starts round 2: the state route broadcasts it, newer stamp.
    const server = new TicTacToeGame('game-1')
    server.restoreState(finished.activeGame.state)
    expect(server.makeMove({ playerId: 'user-2', type: 'next-round', data: {}, timestamp: new Date() })).toBe(true)
    const round2 = server.getState() as Record<string, unknown>
    round2.lastMoveAt = T1 + 5_000
    expect(round2.status).toBe('playing')
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: round2 } })
    })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0))

    // The read that left during round 1 lands now, older than the board.
    await act(async () => {
      answerLobby!({ ok: true, status: 200, json: async () => finished } as Response)
    })
    expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0)
  })

  it('leaves the board playable on this player\'s turn in round 2', async () => {
    const finished = finishedRound1()
    const T1 = finished.activeGame.state.lastMoveAt as number
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => finished } as Response)
    render(<TicTacToeLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())

    let answerLobby: ((r: Response) => void) | null = null
    mockFetchWithGuest.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { answerLobby = resolve })
      return { ok: true, json: async () => ({}) } as Response
    })
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } })
    })
    await waitFor(() => expect(answerLobby).not.toBeNull())

    const server = new TicTacToeGame('game-1')
    server.restoreState(finished.activeGame.state)
    server.makeMove({ playerId: 'user-2', type: 'next-round', data: {}, timestamp: new Date() })
    const round2 = server.getState() as Record<string, unknown>
    round2.lastMoveAt = T1 + 5_000
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: round2 } })
    })
    // O opens round 2; now it is the viewer's (X) turn.
    server.makeMove({ playerId: 'user-2', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
    const round2o = server.getState() as Record<string, unknown>
    round2o.lastMoveAt = T1 + 8_000
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: round2o } })
    })
    const cellA1 = () => screen.getAllByRole('button', { name: 'cell A1' })[0] as HTMLButtonElement
    await waitFor(() => expect(cellA1().disabled).toBe(false))

    await act(async () => {
      answerLobby!({ ok: true, status: 200, json: async () => finished } as Response)
    })
    expect(cellA1().disabled).toBe(false)
  })
})

function finishedWithUndoAsked() {
  const response = buildLobbyResponse()
  const engine = new TicTacToeGame('game-1')
  engine.restoreState(response.activeGame.state)
  const moves = [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 0, 1], ['user-2', 1, 1], ['user-1', 0, 2]]
  for (const [playerId, row, col] of moves) {
    engine.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })
  }
  // The loser asks to take back the winning move; the viewer (user-1) is asked.
  expect(engine.makeMove({ playerId: 'user-2', type: 'request-undo', data: {}, timestamp: new Date() })).toBe(true)
  response.activeGame.state = JSON.parse(JSON.stringify(engine.getState()))
  response.activeGame.status = engine.getState().status
  return response
}

// #1521 review: the host can change only through a lobby read. When that read is overtaken by the
// opponent's next move it is dropped, and the page asks once more instead of losing the new host.
describe('TicTacToeLobbyPage – a host change carried by a read the next move overtook (#1521)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  it('reads the lobby once more and shows this player the host controls when the round ends', async () => {
    const start = buildLobbyResponse()
    start.lobby.creatorId = 'user-2'
    const T0 = start.activeGame.state.lastMoveAt as number
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => start } as Response)
    render(<TicTacToeLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())

    const reads: Array<(r: Response) => void> = []
    mockFetchWithGuest.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { reads.push(resolve) })
      return { ok: true, json: async () => ({}) } as Response
    })
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } })
    })
    await waitFor(() => expect(reads).toHaveLength(1))

    const server = new TicTacToeGame('game-1')
    server.restoreState(start.activeGame.state)
    server.makeMove({ playerId: 'user-1', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
    server.makeMove({ playerId: 'user-2', type: 'place', data: { row: 1, col: 0 }, timestamp: new Date() })
    const twoMarks = JSON.parse(JSON.stringify(server.getState()))
    twoMarks.lastMoveAt = T0 + 1_000
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: twoMarks } })
    })
    await act(async () => { await settleRealtime() })

    // The read left after the host moved to user-1 and before the opponent's move.
    const hostMoved = buildLobbyResponse()
    hostMoved.activeGame.state = start.activeGame.state
    await act(async () => reads[0]({ ok: true, status: 200, json: async () => hostMoved } as Response))
    await waitFor(() => expect(reads).toHaveLength(2))
    const current = buildLobbyResponse()
    current.activeGame.state = twoMarks
    await act(async () => reads[1]({ ok: true, status: 200, json: async () => current } as Response))

    for (const [playerId, row, col] of [['user-1', 0, 1], ['user-2', 1, 1], ['user-1', 0, 2]] as Array<[string, number, number]>) {
      server.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })
    }
    const won = JSON.parse(JSON.stringify(server.getState()))
    won.lastMoveAt = T0 + 5_000
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: won } })
    })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    expect(screen.queryAllByText('lobby.game.playAgain').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('game.ui.askRematch')).toHaveLength(0)
  })
})

// #1521 review: accepting an undo of the winning move puts the round back in play at once; a read
// as old as the board the undo was made on still says 'finished' and must not bring the result back.
describe('TicTacToeLobbyPage – a same-age read while an undo of the winning move is out (#1521)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  it('does not put the result back while the undo is in flight', async () => {
    const asked = finishedWithUndoAsked()
    expect(asked.activeGame.status).toBe('finished')
    mockFetchWithGuest.mockResolvedValue({ ok: true, json: async () => asked } as Response)
    render(<TicTacToeLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())

    let answerLobby: ((r: Response) => void) | null = null
    let answerMove: ((r: Response) => void) | null = null
    mockFetchWithGuest.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/state') && init?.method === 'POST') return new Promise<Response>((resolve) => { answerMove = resolve })
      if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { answerLobby = resolve })
      return { ok: true, json: async () => ({}) } as Response
    })
    // Any update with no state on it makes the page read the lobby; that read is slow.
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } })
    })
    await waitFor(() => expect(answerLobby).not.toBeNull())

    fireEvent.click(screen.getAllByText('games.tictactoe.game.undoAccept')[0])
    await waitFor(() => expect(answerMove).not.toBeNull())
    // Optimistic undo: the round is back in play, no overlay.
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0))

    // The read answers with the board the move was made on: same stamp, status 'finished'.
    await act(async () => {
      answerLobby!({ ok: true, status: 200, json: async () => asked } as Response)
    })
    await act(async () => { await settleRealtime() })
    const overlaysDuringFlight = screen.queryAllByTestId('game-result-overlay').length

    const server = new TicTacToeGame('game-1')
    server.restoreState(JSON.parse(JSON.stringify(asked.activeGame.state)))
    expect(server.makeMove({ playerId: 'user-1', type: 'respond-undo', data: { accept: true }, timestamp: new Date() })).toBe(true)
    const undone = JSON.parse(JSON.stringify(server.getState()))
    undone.lastMoveAt = (asked.activeGame.state.lastMoveAt as number) + 1_000
    await act(async () => {
      answerMove!({ ok: true, status: 200, json: async () => ({ game: { state: undone, status: 'playing' } }) } as Response)
    })
    await act(async () => { await settleRealtime() })
    expect(overlaysDuringFlight).toBe(0)
    expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0)
  })
})
