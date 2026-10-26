// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SketchAndGuessLobbyPage from '@/app/(site)/lobby/[code]/sketch-and-guess-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'
import { frameFor, installSignedRealtime, settleRealtime, signBroadcast } from '@/__tests__/fixtures/signed-realtime'
import { createSketchLiveReceiver, createSketchLiveSender } from '@/lib/client/sketch-live-signing'
import { SKETCH_LIVE_KEY_EVENT, type SketchLiveMessage } from '@/lib/sketch-live'

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
  send: jest.fn(),
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

// The real hook deliberately preserves the `t` reference across renders
// (lib/i18n-helpers.ts), because re-wrapping it makes every callback that depends on it
// unstable. A mock that returns a fresh `t` each render turns any such callback into a
// render loop and would make this suite fail for a reason unrelated to what it asserts.
jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

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
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackLobbyLeaveRedirect: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

// The board owns the guess input; the page only hands it a submit callback, so the mock
// exposes one button that calls it. `SketchScoreRows` is the page's scores panel body,
// which the page imports by name from the same module (#1034) – a default-only mock left
// it undefined and every render threw "Element type is invalid".
jest.mock('@/components/SketchAndGuessGameBoard', () => ({
  __esModule: true,
  default: ({
    onSubmitGuess,
    onLiveStroke,
    onChooseWord,
    onAcceptGuess,
    liveView,
    isHost,
    draft,
    onDraftChange,
  }: {
    onSubmitGuess: (guess: string) => void
    onLiveStroke?: (stroke: unknown) => void
    onChooseWord?: (wordId: string) => void
    onAcceptGuess?: (guessId: string) => void
    liveView?: { strokes: unknown[]; live: unknown } | null
    isHost?: boolean
    draft?: { strokes: unknown[] }
    onDraftChange?: (next: unknown) => void
  }) => (
    <div
      data-testid="sketch-board"
      data-live-strokes={liveView ? String(liveView.strokes.length) : 'none'}
      data-live-stroke={liveView?.live ? 'yes' : 'no'}
      data-host={isHost ? 'true' : 'false'}
    >
      <button onClick={() => onSubmitGuess('apple')}>guess</button>
      <button onClick={() => onLiveStroke?.({ color: '#1F1B16', width: 3, points: [{ x: 1, y: 2 }] })}>draw</button>
      <button onClick={() => onChooseWord?.('castle')}>choose</button>
      <button onClick={() => onAcceptGuess?.('r1-g1')}>accept</button>
      <button onClick={() => onDraftChange?.({ ...draft, strokes: [...(draft?.strokes ?? []), { color: '#000', width: 3, points: [{ x: 1, y: 1 }] }] })}>stroke</button>
    </div>
  ),
  SketchScoreRows: ({ players }: { players: Array<{ id: string; name: string }> }) => (
    <div data-testid="sketch-scores">{players.map((p) => p.name).join(',')}</div>
  ),
  // The page holds the unsubmitted strokes and guess itself, above its three
  // layout trees, and starts them from this factory at module scope (#1034).
  emptySketchAndGuessDraft: () => ({ strokes: [], color: '#1F1B16', isThick: false, isEraser: false, guess: '' }),
  serializeSketchDrawing: (strokes: unknown[]) => JSON.stringify({ type: 'drawing', version: 1, width: 480, height: 480, strokes }),
}))

jest.mock('@/components/Chat', () => ({
  __esModule: true,
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="sketch-chat" data-readonly={readOnly ? 'true' : 'false'} />
  ),
}))

jest.mock('@/components/ConfirmModal', () => ({
  __esModule: true,
  default: () => null,
}))

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
      gameType: 'sketch_and_guess',
      creatorId: 'user-1',
      name: 'Lobby',
      isActive: true,
    },
    activeGame: {
      id: 'game-1',
      gameType: 'sketch_and_guess',
      status: 'playing',
      state: {
        data: {
          phase: 'drawing',
          currentRound: 1,
          totalRounds: 3,
          drawerOrder: ['user-1', 'user-2', 'user-3'],
          currentDrawerId: 'user-2',
          rounds: [],
          submittedPlayerIds: [],
          scores: {},
          scoreBreakdown: {},
          winnerId: null,
          ranking: [],
          completionReason: null,
          finishedAt: null,
          isMvpScaffold: false,
        },
      },
      players: [
        { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', name: 'Cara', user: { username: 'Cara' } },
      ],
    },
  }
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}


describe('SketchAndGuessLobbyPage – the round change and live drawing with reads out of order (#1528)', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const T0 = Date.now() - 5_000
  const stroke = { color: '#1F1B16', width: 3, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }
  const liveBoards = () => screen.getAllByTestId('sketch-board').map((board) => board.getAttribute('data-live-strokes'))

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(broadcastHandlers).forEach((key) => delete broadcastHandlers[key])
  })

  async function framesFrom(drawerId: string, round: number, messages: SketchLiveMessage[]) {
    const frames: unknown[] = []
    const sender = createSketchLiveSender({
      requestCert: async (gameId, key) => signBroadcast(REALTIME_TOPIC, SKETCH_LIVE_KEY_EVENT, { gameId, round, drawerId, ...key }),
      emit: (frame) => frames.push(JSON.parse(JSON.stringify(frame))),
    })
    for (const [index, message] of messages.entries()) {
      sender.send('game-1', message)
      await waitFor(() => expect(frames).toHaveLength(index + 1))
    }
    return frames
  }

  function round1() {
    const r = buildLobbyResponse()
    r.activeGame.state.lastMoveAt = T0
    return r
  }
  function round2() {
    const r = buildLobbyResponse()
    r.activeGame.state.data.currentRound = 2
    r.activeGame.state.data.currentDrawerId = 'user-3'
    r.activeGame.state.lastMoveAt = T0 + 4_000
    return r
  }

  async function renderHolding(onAction: () => unknown = () => ({})) {
    mockFetchWithGuest.mockResolvedValue(okResponse(round1()))
    render(<SketchAndGuessLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getAllByTestId('sketch-board').length).toBeGreaterThan(0))
    await waitFor(() => expect(broadcastHandlers['game-update']).toBeDefined())
    const reads: Array<(r: Response) => void> = []
    const actions: Array<(r: Response) => void> = []
    mockFetchWithGuest.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/lobby/ABCD?')) return new Promise<Response>((resolve) => { reads.push(resolve) })
      if (String(url).includes('/sketch-and-guess-action')) return new Promise<Response>((resolve) => { actions.push(resolve) })
      return okResponse(onAction())
    })
    return { reads, actions }
  }

  for (const order of ['new-first', 'old-first'] as const) {
    it(`paints the round-2 drawer's stream after reads land out of order (${order})`, async () => {
      const { reads } = await renderHolding()
      await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1' } }) })
      await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1' } }) })
      await waitFor(() => expect(reads.length).toBe(2))
      if (order === 'new-first') {
        await act(async () => reads[1](okResponse(round2())))
        await act(async () => reads[0](okResponse(round1())))
      } else {
        await act(async () => reads[0](okResponse(round1())))
        await act(async () => reads[1](okResponse(round2())))
      }
      const extraReads = reads.length
      await act(async () => { await settleRealtime() })
      const frames = await framesFrom('user-3', 2, [{ kind: 'strokes', round: 2, drawerId: 'user-3', strokes: [stroke] }])
      await act(async () => { for (const frame of frames) broadcastHandlers['sketch-live']({ payload: frame }) })
      await waitFor(() => expect(liveBoards().every((count) => count === '1')).toBe(true))
      expect(extraReads).toBe(2)
    })
  }

  it('keeps round 2 when a guess is answered after the round moved on', async () => {
    const { reads, actions } = await renderHolding()
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'guess' })[0]) })
    await waitFor(() => expect(actions.length).toBe(1))
    // The round moves on (a broadcast), and the page's read lands while the guess is out.
    await act(async () => { broadcastHandlers['game-update']?.({ payload: { action: 'state-change', gameId: 'game-1' } }) })
    await waitFor(() => expect(reads.length).toBe(1))
    await act(async () => reads[0](okResponse(round2())))
    // The guess was written before the round moved: its answer is round 1 plus the guess.
    const answered = { ...round1().activeGame.state, lastMoveAt: T0 + 1_000 }
    await act(async () => actions[0](okResponse({ success: true, state: answered, guessResult: { correct: false, close: false } })))
    const extraReads = reads.length
    await act(async () => { await settleRealtime() })
    const frames = await framesFrom('user-3', 2, [{ kind: 'strokes', round: 2, drawerId: 'user-3', strokes: [stroke] }])
    await act(async () => { for (const frame of frames) broadcastHandlers['sketch-live']({ payload: frame }) })
    await waitFor(() => expect(liveBoards().every((count) => count === '1')).toBe(true))
    expect(extraReads).toBe(1)
  })
})
