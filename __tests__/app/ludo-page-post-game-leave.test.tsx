// @ts-nocheck
import { act, render, screen, waitFor } from '@testing-library/react'
import LudoLobbyPage from '@/app/(site)/lobby/[code]/ludo-page'
import { LudoGame } from '@/lib/games/ludo-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
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

// #1528 review 3: a post-game host leave writes no game state, so the reads on either side of it are
// as old, and the server can answer them out of the order they left in.
const LEFT_AT = new Date(Date.now() - 1_000).toISOString()
const present = () => PLAYERS.map((p) => ({ ...p, leftAt: null }))
const bobLeft = () => PLAYERS.map((p) => ({ ...p, leftAt: p.userId === 'user-2' ? LEFT_AT : null }))
function postGame(creatorId: string, players: any[], state: any) {
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'ludo', creatorId, name: 'Lobby', isActive: true, turnTimer: 60 },
    activeGame: { id: 'game-1', status: 'finished', currentTurn: 0, state, players },
  }
}
const finishedState = () => {
  const f = finishedFrom(startState(), Date.now() - 30_000)
  f.updatedAt = new Date(f.lastMoveAt).toISOString()
  return f
}
const playAgainShown = () => screen.queryAllByText('lobby.game.playAgain').length > 0

async function renderFinishedWithTwoReads(fin: any) {
  mockFetch.mockResolvedValue(ok(postGame('user-2', present(), fin)))
  render(<LudoLobbyPage code="ABCD" />)
  await waitFor(() => expect(screen.queryAllByTestId('game-result-overlay').length).toBeGreaterThan(0))
  await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())
  expect(playAgainShown()).toBe(false) // Alice (viewer) is not host yet
  const held = holdReads()
  // Two updates that carry no state; each asks for a read.
  await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } }) })
  await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'player-update' } }) })
  await waitFor(() => expect(held.reads.length).toBe(2))
  return held
}

describe('LudoLobbyPage – a post-game host leave between two reads as old (#1528)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((k) => delete broadcastHandlers[k])
  })

  it('the new host gets Play again when the frame is lost and the read answered before the leave lands first', async () => {
    const fin = finishedState()
    const { reads } = await renderFinishedWithTwoReads(fin)
    await act(async () => reads[1](ok(postGame('user-2', present(), fin))))
    await act(async () => reads[0](ok(postGame('user-1', bobLeft(), fin))))
    await act(async () => { await settleRealtime() })
    expect(playAgainShown()).toBe(true)
  })

  it('the new host gets Play again when the frame is lost and the read answered after the leave lands first', async () => {
    const fin = finishedState()
    const { reads } = await renderFinishedWithTwoReads(fin)
    await act(async () => reads[0](ok(postGame('user-1', bobLeft(), fin))))
    await act(async () => reads[1](ok(postGame('user-2', present(), fin))))
    await act(async () => { await settleRealtime() })
    expect(playAgainShown()).toBe(true)
  })

  it('the new host gets Play again when the frame arrives and its read is refused', async () => {
    const fin = finishedState()
    const { reads } = await renderFinishedWithTwoReads(fin)
    await act(async () => {
      broadcastHandlers['player-left']?.({ payload: { userId: 'user-2', username: 'Bob', remainingPlayers: 2, nextCreatorId: 'user-1', nextCreatorName: 'Alice', leftAt: LEFT_AT, gameTerminal: true } })
    })
    await waitFor(() => expect(reads.length).toBe(3))
    await act(async () => reads[1](ok(postGame('user-2', present(), fin))))
    await act(async () => reads[0](ok(postGame('user-1', bobLeft(), fin))))
    await act(async () => reads[2](failed(429)))
    await act(async () => { await settleRealtime() })
    expect(playAgainShown()).toBe(true)
  })
})
