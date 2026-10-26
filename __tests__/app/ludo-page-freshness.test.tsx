// @ts-nocheck
import { act, render, screen, waitFor } from '@testing-library/react'
import LudoLobbyPage from '@/app/(site)/lobby/[code]/ludo-page'
import { LudoGame } from '@/lib/games/ludo-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { frameFor, installSignedRealtime, settleRealtime } from '@/__tests__/fixtures/signed-realtime'

installSignedRealtime()
const REALTIME_TOPIC = 'lobby:ABCD:test-secret'
const broadcastHandlers: Record<string, (data: { payload: unknown }) => void> = {}
const mockChannel: any = {
  on: jest.fn((type: string, filter: { event?: string }, handler: (data: unknown) => void) => {
    if (type === 'broadcast' && filter.event) {
      const event = filter.event
      broadcastHandlers[event] = ((data: { payload: unknown }) =>
        handler({ payload: frameFor(REALTIME_TOPIC, event, data.payload) })) as any
    }
    return mockChannel
  }),
  subscribe: jest.fn(() => mockChannel),
}
jest.mock('next/navigation', () => {
  const router = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }
  return { useRouter: () => router }
})
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'user-1' } }, status: 'authenticated' }) }))
jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ isGuest: false, guestToken: null, guestId: null }) }))
jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/lib/i18n-toast', () => ({ showToast: { error: jest.fn(), errorFrom: jest.fn(), success: jest.fn(), info: jest.fn(), infoText: jest.fn() } }))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))
jest.mock('@/lib/analytics', () => ({ trackLobbyLeaveRedirect: jest.fn(), trackMoveSubmitApplied: jest.fn() }))
jest.mock('@/lib/sound-engine', () => ({ ...jest.requireActual('@/lib/sound-engine'), playCue: jest.fn(() => true) }))
jest.mock('@/components/LoadingSpinner', () => ({ __esModule: true, default: () => <div data-testid="loading-spinner" /> }))
jest.mock('@/components/ConfirmModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/lobby-realtime-topic-client', () => ({ fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`) }))
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({ channel: jest.fn(() => mockChannel), removeChannel: jest.fn().mockResolvedValue({}) })),
}))

if (!(Element.prototype as any).animate) {
  ;(Element.prototype as any).animate = function () {
    return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, addEventListener() {}, removeEventListener() {} }
  }
}

const PLAYERS = [
  { id: 'p1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
  { id: 'p2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
  { id: 'p3', userId: 'user-3', name: 'Cara', user: { username: 'Cara' } },
]

function startState() {
  const engine = new LudoGame('game-1')
  for (const p of PLAYERS) engine.addPlayer({ id: p.userId, name: p.name, score: 0, isActive: true })
  engine.startGame()
  const s = engine.getState() as any
  // Cara (user-3) is on the clock, so the viewer (user-1) only watches.
  s.currentPlayerIndex = 2
  s.data.turnPlayerId = 'user-3'
  s.lastMoveAt = Date.now() - 10_000
  return JSON.parse(JSON.stringify(s))
}

function response(state: any, creatorId: string, gameId = 'game-1') {
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'ludo', creatorId, name: 'Lobby', isActive: true, turnTimer: 60 },
    activeGame: { id: gameId, status: state.status, currentTurn: 0, state, players: PLAYERS },
  }
}

// #1521 review: lobby facts such as the host ride on lobby reads, and a read whose game state is
// older than the board is dropped – its host must not be lost with it.
describe('LudoLobbyPage – lobby facts and game ids carried by a dropped read (#1521)', () => {
  const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((k) => delete broadcastHandlers[k])
  })

  it('the player who inherits the host sees Play again when the game ends', async () => {
    const s0 = startState()
    const L0 = s0.lastMoveAt as number
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => response(s0, 'user-2') } as Response)
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(broadcastHandlers['player-left']).toBeDefined())
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())

    // From here every lobby read is held until the test answers it.
    let answerLobby: ((r: Response) => void) | null = null
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { answerLobby = resolve })
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    // Bob (the host) leaves mid-game; Alice is the new host. The page reads the lobby.
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 2, nextCreatorId: 'user-1', nextCreatorName: 'Alice' } })
    })
    await waitFor(() => expect((showToast as any).success).toHaveBeenCalledWith('toast.youAreNowHost'))
    await waitFor(() => expect(answerLobby).not.toBeNull())

    // Before that read is answered, Cara rolls: the state route broadcasts it.
    const server = new LudoGame('game-1')
    server.restoreState(JSON.parse(JSON.stringify(s0)))
    expect(server.makeMove({ playerId: 'user-3', type: 'roll', data: {}, timestamp: new Date() })).toBe(true)
    const s1 = JSON.parse(JSON.stringify(server.getState()))
    s1.lastMoveAt = L0 + 1_000
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: s1 } })
    })
    await act(async () => { await settleRealtime() })

    // The read lands now: it was taken before the roll, after the host moved to Alice.
    const sLeave = JSON.parse(JSON.stringify(s0))
    sLeave.players = sLeave.players.map((p: any) => (p.id === 'user-2' ? { ...p, isActive: false, disconnectedAt: L0 + 500 } : p))
    sLeave.updatedAt = new Date(L0 + 500).toISOString()
    await act(async () => {
      answerLobby!({ ok: true, status: 200, json: async () => response(sLeave, 'user-1') } as Response)
    })
    await act(async () => { await settleRealtime() })

    // The game ends (a broadcast, as every move does).
    const s2 = JSON.parse(JSON.stringify(s1))
    s2.status = 'finished'
    s2.winner = 'user-3'
    s2.data.winnerId = 'user-3'
    s2.data.ranking = ['user-3', 'user-1', 'user-2']
    s2.lastMoveAt = L0 + 5_000
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: s2 } })
    })
    await act(async () => { await settleRealtime() })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))

    const playAgain = screen.queryAllByText('lobby.game.playAgain')
    expect(playAgain.length).toBeGreaterThan(0)
  })

  // A rematch is a new game row. Its first broadcast is tagged with that row; applied to the
  // finished game it raised the bar over the rematch read, which was then dropped.
  it('moves on to the rematch row, so the next roll goes to the new game', async () => {
    const finished = startState()
    finished.status = 'finished'
    finished.winner = 'user-3'
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => response(finished, 'user-1') } as Response)
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(broadcastHandlers['game-started']).toBeDefined())
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())

    const reads: Array<(r: Response) => void> = []
    const posts: string[] = []
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { reads.push(resolve) })
      if (init?.method === 'POST' && String(url).endsWith('/state')) posts.push(String(url))
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    const engine = new LudoGame('game-2')
    for (const p of PLAYERS) engine.addPlayer({ id: p.userId, name: p.name, score: 0, isActive: true })
    engine.startGame()
    const rematch = JSON.parse(JSON.stringify(engine.getState()))
    rematch.currentPlayerIndex = 0
    rematch.data.turnPlayerId = 'user-1'
    rematch.lastMoveAt = Date.now() - 2_000
    const rematchLater = JSON.parse(JSON.stringify(rematch))
    rematchLater.lastMoveAt = rematch.lastMoveAt + 1_000

    await act(async () => {
      broadcastHandlers['game-started']?.({ payload: { gameId: 'game-2' } })
    })
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-2', payload: rematchLater } })
    })
    await act(async () => { await settleRealtime() })

    await act(async () => reads[0]({ ok: true, status: 200, json: async () => response(rematch, 'user-1', 'game-2') } as Response))
    await act(async () => { await settleRealtime() })

    const roll = await waitFor(() => {
      const button = screen.getAllByTestId('ludo-roll-button')[0] as HTMLButtonElement
      expect(button.disabled).toBe(false)
      return button
    })
    await act(async () => { roll.click() })
    await waitFor(() => expect(posts.length).toBeGreaterThan(0))
    expect(posts[0]).toBe('/api/game/game-2/state')
  })
})
