// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/(site)/lobby/[code]/tic-tac-toe-page'
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

const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response)

function hold() {
  const reads: Array<(r: Response) => void> = []
  const moves: Array<(r: Response) => void> = []
  const posts: string[] = []
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/state') && init?.method === 'POST') {
      posts.push(String(url))
      return new Promise<Response>((resolve) => { moves.push(resolve) })
    }
    if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { reads.push(resolve) })
    return ok({})
  })
  return { reads, moves, posts }
}

const cellA1 = () => screen.getAllByRole('button', { name: 'cell A1' })[0] as HTMLButtonElement
const a1Empty = () => cellA1().querySelector('.ttt-cell-coord') !== null

describe('TicTacToeLobbyPage – a refused move with lobby reads in flight (#1528)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  const orders: Array<[string, number[]]> = [
    ['later-read, reconcile, pre-move read', [2, 1, 0]],
    ['reconcile, later-read, pre-move read', [1, 2, 0]],
    ['pre-move read, later-read, reconcile', [0, 2, 1]],
    ['later-read, pre-move read, reconcile', [2, 0, 1]],
    ['pre-move read, reconcile, later-read', [0, 1, 2]],
  ]
  for (const [name, order] of orders) {
    it(`takes the refused mark off the board (${name})`, async () => {
      const server = buildLobbyResponse()
      const same = () => JSON.parse(JSON.stringify(server))
      mockFetch.mockResolvedValue(ok(same()))
      render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
      await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())
      const { reads, moves } = hold()

      await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } }) })
      await waitFor(() => expect(reads.length).toBe(1))
      fireEvent.click(cellA1())
      await waitFor(() => expect(a1Empty()).toBe(false))
      await waitFor(() => expect(moves.length).toBe(1))
      // The server refuses the mark; the page sends its reconcile.
      await act(async () => moves[0]({ ok: false, status: 409, json: async () => ({ error: 'conflict' }) } as Response))
      await waitFor(() => expect(reads.length).toBe(2))
      // Another update arrives while the reconcile is out; the page reads again.
      await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } }) })
      await waitFor(() => expect(reads.length).toBe(3))

      for (const index of order) {
        await act(async () => reads[index](ok(same())))
        await act(async () => { await settleRealtime() })
      }
      // Every read carried the same stamp as the board the mark was made on; no follow-up is answered.
      expect(reads.length).toBe(3)
      expect(a1Empty()).toBe(true)
      expect(cellA1().disabled).toBe(false)
    })
  }
})

describe('TicTacToeLobbyPage – a non-host rematch with a read from the finished game in flight (#1528)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  function finishedGame1() {
    const response = buildLobbyResponse()
    response.lobby.creatorId = 'user-2'
    const engine = new TicTacToeGame('game-1')
    engine.restoreState(response.activeGame.state)
    for (const [playerId, row, col] of [['user-1', 0, 0], ['user-2', 1, 0], ['user-1', 0, 1], ['user-2', 1, 1], ['user-1', 0, 2]] as Array<[string, number, number]>) {
      engine.makeMove({ playerId, type: 'place', data: { row, col }, timestamp: new Date() })
    }
    response.activeGame.state = JSON.parse(JSON.stringify(engine.getState()))
    response.activeGame.state.lastMoveAt = Date.now() - 30_000
    response.activeGame.status = engine.getState().status
    return response
  }
  function game2() {
    const response = buildLobbyResponse()
    response.lobby.creatorId = 'user-2'
    const engine = new TicTacToeGame('game-2')
    engine.addPlayer({ id: 'user-1', name: 'Alice', score: 0, isActive: true })
    engine.addPlayer({ id: 'user-2', name: 'Bob', score: 0, isActive: true })
    engine.startGame()
    const state = JSON.parse(JSON.stringify(engine.getState()))
    state.lastMoveAt = Date.now() - 2_000
    response.activeGame = { ...response.activeGame, id: 'game-2', status: 'playing', state }
    return response
  }

  for (const order of ['old-last', 'old-first'] as const) {
    it(`keeps the rematch row on screen and sends the next mark to it (${order})`, async () => {
      const finished = finishedGame1()
      expect(finished.activeGame.status).toBe('finished')
      mockFetch.mockResolvedValue(ok(finished))
      render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
      await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())
      const { reads, posts } = hold()
      await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } }) })
      await waitFor(() => expect(reads.length).toBe(1))
      const next = game2()
      // The create route's broadcast is tagged with the new row, so the page reads.
      await act(async () => {
        broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-2', payload: { state: next.activeGame.state } } })
      })
      await waitFor(() => expect(reads.length).toBe(2))
      if (order === 'old-last') {
        await act(async () => reads[1](ok(next)))
        await act(async () => reads[0](ok(finished)))
      } else {
        await act(async () => reads[0](ok(finished)))
        await act(async () => reads[1](ok(next)))
      }
      await act(async () => { await settleRealtime() })
      expect(reads.length).toBe(2)
      expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0)
      await waitFor(() => expect(cellA1().disabled).toBe(false))
      fireEvent.click(cellA1())
      await waitFor(() => expect(posts.length).toBeGreaterThan(0))
      expect(posts[0]).toBe('/api/game/game-2/state')
    })
  }
})
