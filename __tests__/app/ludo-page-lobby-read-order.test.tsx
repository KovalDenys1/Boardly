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

const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response)
const failed = (status: number) => ({ ok: false, status, json: async () => ({ error: 'nope' }) } as Response)

function finishedFrom(s: any, lastMoveAt: number) {
  const f = JSON.parse(JSON.stringify(s))
  f.status = 'finished'
  f.winner = 'user-3'
  f.data.winnerId = 'user-3'
  f.data.ranking = ['user-3', 'user-1', 'user-2']
  f.lastMoveAt = lastMoveAt
  return f
}

function holdReads() {
  const reads: Array<(r: Response) => void> = []
  const posts: string[] = []
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { reads.push(resolve) })
    if (init?.method === 'POST' && String(url).endsWith('/state')) posts.push(String(url))
    return ok({})
  })
  return { reads, posts }
}

// #1528: the host on screen is never a player a frame or a read reported gone, and an older frame or
// read never undoes a host change from a newer one – whatever order the frames and reads land in.
describe('LudoLobbyPage – leave frames and lobby reads out of order (#1528)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((k) => delete broadcastHandlers[k])
  })

  it('the new host gets Play again when the host left before the first read landed and the leave read is refused', async () => {
    const { reads } = holdReads()
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(broadcastHandlers['player-left']).toBeDefined())
    await waitFor(() => expect(reads.length).toBe(1))

    // Bob (host) leaves before the first read has landed; Alice (viewer) inherits it.
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 2, nextCreatorId: 'user-1', nextCreatorName: 'Alice' } })
    })
    await waitFor(() => expect(reads.length).toBe(2))
    const s0 = startState()
    s0.updatedAt = new Date(s0.lastMoveAt).toISOString()
    // The first read was answered before the leave: Bob still host.
    await act(async () => reads[0](ok(response(s0, 'user-2'))))
    // The frame's read is refused (a 429 or 5xx on the lobby GET).
    await act(async () => reads[1](failed(429)))
    await act(async () => { await settleRealtime() })

    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: finishedFrom(s0, s0.lastMoveAt + 5_000) } })
    })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    expect(screen.queryAllByText('lobby.game.playAgain').length).toBeGreaterThan(0)
  })

  it('the new host gets Play again when a read from before the leave lands and the leave read is refused', async () => {
    const s0 = startState()
    s0.updatedAt = new Date(s0.lastMoveAt).toISOString()
    mockFetch.mockResolvedValue(ok(response(s0, 'user-2')))
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getAllByTestId('ludo-roll-button').length).toBeGreaterThan(0))
    const { reads } = holdReads()
    await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1' } }) })
    await waitFor(() => expect(reads.length).toBe(1))
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 2, nextCreatorId: 'user-1', nextCreatorName: 'Alice' } })
    })
    await waitFor(() => expect(reads.length).toBe(2))
    await act(async () => reads[0](ok(response(s0, 'user-2'))))
    await act(async () => reads[1](failed(429)))
    await act(async () => { await settleRealtime() })
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: finishedFrom(s0, s0.lastMoveAt + 5_000) } })
    })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    expect(screen.queryAllByText('lobby.game.playAgain').length).toBeGreaterThan(0)
  })

  it('the last host gets Play again after two leaves whose reads land newest first', async () => {
    const s0 = startState()
    s0.updatedAt = new Date(s0.lastMoveAt).toISOString()
    mockFetch.mockResolvedValue(ok(response(s0, 'user-2')))
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getAllByTestId('ludo-roll-button').length).toBeGreaterThan(0))
    const { reads } = holdReads()
    // Bob (host) leaves -> Cara; then Cara leaves -> Alice (viewer).
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 3, nextCreatorId: 'user-3', nextCreatorName: 'Cara' } })
    })
    await waitFor(() => expect(reads.length).toBe(1))
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-3', username: 'Cara', remainingPlayers: 2, nextCreatorId: 'user-1', nextCreatorName: 'Alice' } })
    })
    await waitFor(() => expect(reads.length).toBe(2))
    // Second read lands first (host Alice), first read last (host Cara).
    await act(async () => reads[1](ok(response(s0, 'user-1'))))
    await act(async () => reads[0](ok(response(s0, 'user-3'))))
    await act(async () => { await settleRealtime() })
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: finishedFrom(s0, s0.lastMoveAt + 5_000) } })
    })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    expect(screen.queryAllByText('lobby.game.playAgain').length).toBeGreaterThan(0)
  })

  it('the last host gets Play again after two leaves whose reads land in order', async () => {
    const s0 = startState()
    s0.updatedAt = new Date(s0.lastMoveAt).toISOString()
    mockFetch.mockResolvedValue(ok(response(s0, 'user-2')))
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getAllByTestId('ludo-roll-button').length).toBeGreaterThan(0))
    const { reads } = holdReads()
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 3, nextCreatorId: 'user-3', nextCreatorName: 'Cara' } })
    })
    await waitFor(() => expect(reads.length).toBe(1))
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-3', username: 'Cara', remainingPlayers: 2, nextCreatorId: 'user-1', nextCreatorName: 'Alice' } })
    })
    await waitFor(() => expect(reads.length).toBe(2))
    await act(async () => reads[0](ok(response(s0, 'user-3'))))
    await act(async () => reads[1](ok(response(s0, 'user-1'))))
    await act(async () => { await settleRealtime() })
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: finishedFrom(s0, s0.lastMoveAt + 5_000) } })
    })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    expect(screen.queryAllByText('lobby.game.playAgain').length).toBeGreaterThan(0)
  })

  function rematchState(lastMoveAt: number) {
    const engine = new LudoGame('game-2')
    for (const p of PLAYERS) engine.addPlayer({ id: p.userId, name: p.name, score: 0, isActive: true })
    engine.startGame()
    const s = JSON.parse(JSON.stringify(engine.getState()))
    s.currentPlayerIndex = 0
    s.data.turnPlayerId = 'user-1'
    s.lastMoveAt = lastMoveAt
    return s
  }

  for (const order of ['old-read-lands-last', 'old-read-lands-first'] as const) {
    it(`moves a non-host on to the rematch with a read from the finished game still in flight (${order})`, async () => {
      const finished = finishedFrom(startState(), Date.now() - 30_000)
      mockFetch.mockResolvedValue(ok(response(finished, 'user-2')))
      render(<LudoLobbyPage code="ABCD" />)
      await waitFor(() => expect(broadcastHandlers['game-started']).toBeDefined())
      await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
      const { reads, posts } = holdReads()
      // A read leaves while the finished game is on screen.
      await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1' } }) })
      await waitFor(() => expect(reads.length).toBe(1))
      // The host starts a rematch: game-started resets the board watermark and reads.
      await act(async () => { broadcastHandlers['game-started']?.({ payload: { gameId: 'game-2' } }) })
      await waitFor(() => expect(reads.length).toBe(2))
      const rematch = rematchState(Date.now() - 2_000)
      if (order === 'old-read-lands-last') {
        await act(async () => reads[1](ok(response(rematch, 'user-2', 'game-2'))))
        await act(async () => reads[0](ok(response(finished, 'user-2'))))
      } else {
        await act(async () => reads[0](ok(response(finished, 'user-2'))))
        await act(async () => reads[1](ok(response(rematch, 'user-2', 'game-2'))))
      }
      await act(async () => { await settleRealtime() })
      expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0)
      const roll = await waitFor(() => {
        const button = screen.getAllByTestId('ludo-roll-button')[0] as HTMLButtonElement
        expect(button.disabled).toBe(false)
        return button
      })
      await act(async () => { roll.click() })
      await waitFor(() => expect(posts.length).toBeGreaterThan(0))
      expect(posts[0]).toBe('/api/game/game-2/state')
    })
  }

  it('keeps the rematch when a late leave frame of the finished game arrives', async () => {
    const finished = finishedFrom(startState(), Date.now() - 30_000)
    mockFetch.mockResolvedValue(ok(response(finished, 'user-2')))
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(broadcastHandlers['game-started']).toBeDefined())
    const rematch = rematchState(Date.now() - 2_000)
    mockFetch.mockResolvedValue(ok(response(rematch, 'user-2', 'game-2')))
    await act(async () => { broadcastHandlers['game-started']?.({ payload: { gameId: 'game-2' } }) })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0))
    const { reads, posts } = holdReads()
    const lateLeave = JSON.parse(JSON.stringify(finished))
    lateLeave.lastMoveAt = Date.now()  // even a newer stamp must not be written into game-2
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: lateLeave } })
    })
    await waitFor(() => expect(reads.length).toBe(1))
    await act(async () => reads[0](ok(response(rematch, 'user-2', 'game-2'))))
    await act(async () => { await settleRealtime() })
    expect(screen.queryAllByTestId('game-result-overlay')).toHaveLength(0)
    const roll = await waitFor(() => {
      const button = screen.getAllByTestId('ludo-roll-button')[0] as HTMLButtonElement
      expect(button.disabled).toBe(false)
      return button
    })
    await act(async () => { roll.click() })
    await waitFor(() => expect(posts.length).toBeGreaterThan(0))
    expect(posts[0]).toBe('/api/game/game-2/state')
  })
  it('the last host gets Play again when two leave frames arrive newest first and the last read is refused', async () => {
    const s0 = startState()
    s0.updatedAt = new Date(s0.lastMoveAt).toISOString()
    mockFetch.mockResolvedValue(ok(response(s0, 'user-2')))
    render(<LudoLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getAllByTestId('ludo-roll-button').length).toBeGreaterThan(0))
    const { reads } = holdReads()
    // Server order: Bob (host) left -> Cara; then Cara left -> Alice (viewer). The frames arrive newest first.
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-3', username: 'Cara', remainingPlayers: 2, nextCreatorId: 'user-1', nextCreatorName: 'Alice' } })
    })
    await waitFor(() => expect(reads.length).toBe(1))
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 3, nextCreatorId: 'user-3', nextCreatorName: 'Cara' } })
    })
    await waitFor(() => expect(reads.length).toBe(2))
    // Both reads were answered after both leaves: Alice is host. The first lands, the second is refused.
    await act(async () => reads[0](ok(response(s0, 'user-1'))))
    await act(async () => reads[1](failed(429)))
    await act(async () => { await settleRealtime() })
    await act(async () => {
      broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1', payload: finishedFrom(s0, s0.lastMoveAt + 5_000) } })
    })
    await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
    expect(screen.queryAllByText('lobby.game.playAgain').length).toBeGreaterThan(0)
  })
})
