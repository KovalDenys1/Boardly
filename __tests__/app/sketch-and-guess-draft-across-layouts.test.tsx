// @ts-nocheck
/**
 * #1034, found by review: the chrome migration lays this page out three times –
 * `.ttt-desktop-layout`, `.game-landscape-layout`, `.ttt-mobile-layout` – and CSS
 * shows exactly one of them at a time. Each tree used to mount its own board with
 * its own `useState`, so the strokes on the canvas existed in one tree only.
 * Rotating a phone, or dragging a desktop window across 1024px, swaps which tree
 * is visible and the drawer's work vanished with the 90-second clock still
 * running. Develop rendered the board once, so this was a regression.
 *
 * These tests render the real board inside the real page (only the network, the
 * router and the chat are mocked) and assert the unsubmitted half of a round is
 * shared by every tree.
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }),
}))
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, status: 'authenticated' }),
}))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
}))
// One stable `t` across renders, as in every other page suite here: a fresh one
// per render makes any callback that depends on it unstable.
jest.mock('@/lib/i18n-helpers', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})
jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), errorFrom: jest.fn(), success: jest.fn(), info: jest.fn(), infoText: jest.fn() },
}))
jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))
jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))
jest.mock('@/lib/analytics', () => ({ trackLobbyLeaveRedirect: jest.fn(), trackMoveSubmitApplied: jest.fn() }))
jest.mock('@/components/Chat', () => ({ __esModule: true, default: () => <div data-testid="chat" /> }))
jest.mock('@/components/ConfirmModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/ReactionOverlay', () => ({ ReactionOverlay: () => null }))
jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => {
      const channel: any = { on: jest.fn(() => channel), subscribe: jest.fn(() => channel), send: jest.fn() }
      return channel
    }),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

import SketchAndGuessLobbyPage from '@/app/lobby/[code]/sketch-and-guess-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const UNDO = 'games.guess_my_drawing.game.undo'
const GUESS_BOX = 'games.guess_my_drawing.game.guessPlaceholder'

function buildResponse(phase: 'drawing' | 'guessing') {
  // user-2 draws, so user-1 is the drawer only in the 'drawing' fixture below.
  const drawerId = phase === 'drawing' ? 'user-1' : 'user-2'
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'sketch_and_guess', creatorId: 'user-1', name: 'Lobby', isActive: true },
    activeGame: {
      id: 'game-1',
      gameType: 'sketch_and_guess',
      status: 'playing',
      state: {
        data: {
          phase,
          currentRound: 1,
          totalRounds: 3,
          drawerOrder: ['user-1', 'user-2', 'user-3'],
          currentDrawerId: drawerId,
          rounds: [
            {
              round: 1,
              drawerId,
              prompt: phase === 'drawing' ? 'castle' : '',
              drawingContent: phase === 'drawing' ? null : '{"type":"drawing","version":1,"width":480,"height":480,"strokes":[]}',
              drawingSubmittedAt: null,
              drawingAutoSubmitted: false,
              guesses: [],
              revealAt: null,
              isScored: false,
              scoredAt: null,
            },
          ],
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

const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

async function renderPage(phase: 'drawing' | 'guessing') {
  mockFetchWithGuest.mockResolvedValue({ ok: true, status: 200, json: async () => buildResponse(phase) } as Response)
  const view = render(<SketchAndGuessLobbyPage code="ABCD" />)
  await waitFor(() => expect(view.container.querySelectorAll('canvas').length).toBeGreaterThan(0))
  return view
}

/** Every layout tree renders a canvas, so the count is the number of trees. */
const undoButtons = () => screen.queryAllByText(UNDO).map((node) => node.closest('button') as HTMLButtonElement)

describe('Sketch & Guess draft survives a layout-tree swap (#1034)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('draws the same strokes in every layout tree, whichever tree the pointer was in', async () => {
    const { container } = await renderPage('drawing')

    const canvases = Array.from(container.querySelectorAll('canvas'))
    // The three trees are the desktop, phone-landscape and phone-portrait ones;
    // CSS shows one at a time, and a rotation changes which.
    expect(canvases.length).toBeGreaterThan(1)
    expect(undoButtons()).toHaveLength(canvases.length)
    expect(undoButtons().every((button) => button.disabled)).toBe(true)

    // Draw one stroke in the last tree – on a phone in landscape, say.
    const target = canvases[canvases.length - 1] as HTMLCanvasElement
    target.setPointerCapture = () => {}
    await act(async () => {
      fireEvent.pointerDown(target, { clientX: 10, clientY: 10, pointerId: 1 })
      fireEvent.pointerMove(target, { clientX: 60, clientY: 60, pointerId: 1 })
      fireEvent.pointerUp(target, { clientX: 60, clientY: 60, pointerId: 1 })
    })

    // Undo is enabled exactly when that instance holds a stroke, so an enabled
    // Undo in all of them is the drawing being owned above the trees. Rotating
    // the device is CSS hiding one and showing another, which needs no rerender:
    // whichever tree the phone shows next already has the work in it.
    const enabled = undoButtons().map((button) => !button.disabled)
    expect(enabled).toEqual(canvases.map(() => true))
  })

  it('carries a half-typed guess into every tree as well', async () => {
    await renderPage('guessing')

    const boxes = screen.getAllByPlaceholderText(GUESS_BOX) as HTMLInputElement[]
    expect(boxes.length).toBeGreaterThan(1)

    fireEvent.change(boxes[boxes.length - 1], { target: { value: 'dragon' } })

    const values = (screen.getAllByPlaceholderText(GUESS_BOX) as HTMLInputElement[]).map((box) => box.value)
    expect(values).toEqual(boxes.map(() => 'dragon'))
  })
})
