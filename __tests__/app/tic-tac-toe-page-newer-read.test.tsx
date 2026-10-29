// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/(site)/lobby/[code]/tic-tac-toe-page'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
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


function holdReads() {
  const reads: Array<(r: Response) => void> = []
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { reads.push(resolve) })
    return ok({})
  })
  return { reads }
}

const cell = (name: string) => screen.getAllByRole('button', { name: `cell ${name}` })[0] as HTMLButtonElement
const isEmpty = (name: string) => cell(name).querySelector('.ttt-cell-coord') !== null

// Alice (viewer) has played A1; it is Bob's turn (S0). Bob then plays B2 (S1): Alice's turn.
function states() {
  const base = buildLobbyResponse()
  const engine = new TicTacToeGame('game-1')
  engine.restoreState(base.activeGame.state)
  engine.makeMove({ playerId: 'user-1', type: 'place', data: { row: 0, col: 0 }, timestamp: new Date() })
  const s0 = JSON.parse(JSON.stringify(engine.getState()))
  s0.lastMoveAt = Date.now() - 4_000
  engine.makeMove({ playerId: 'user-2', type: 'place', data: { row: 1, col: 1 }, timestamp: new Date() })
  const s1 = JSON.parse(JSON.stringify(engine.getState()))
  s1.lastMoveAt = s0.lastMoveAt + 2_000
  const at = (state: any) => ({ ...base, activeGame: { ...base.activeGame, state } })
  return { r0: at(s0), r1: at(s1) }
}

// #1528 review: send order only orders reads whose game state is as old; a read with a newer board
// always brings it, or a move whose broadcast was lost never reaches the screen.
describe('TicTacToeLobbyPage – a read that left first and carries a newer board (#1528)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  it('shows the opponent move a read that left first carries, after a later read with the older board landed', async () => {
    const { r0, r1 } = states()
    mockFetch.mockResolvedValue(ok(JSON.parse(JSON.stringify(r0))))
    render(<TicTacToeLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())
    await waitFor(() => expect(isEmpty('A1')).toBe(false))
    const { reads } = holdReads()
    // Two updates with no state in them; each asks for a read.
    await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } }) })
    await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } }) })
    await waitFor(() => expect(reads.length).toBe(2))
    // The second read was answered before Bob moved, the first after (a slow hop); Bob's own broadcast is lost.
    await act(async () => reads[1](ok(JSON.parse(JSON.stringify(r0)))))
    await act(async () => { await settleRealtime() })
    await act(async () => reads[0](ok(JSON.parse(JSON.stringify(r1)))))
    await act(async () => { await settleRealtime() })
    expect({ bobMarkShown: !isEmpty('B2'), aliceCanPlayC3: !cell('C3').disabled, readsSent: reads.length })
      .toEqual({ bobMarkShown: true, aliceCanPlayC3: true, readsSent: 2 })
  })
})
