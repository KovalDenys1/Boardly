/**
 * @jest-environment jsdom
 *
 * #903. A board card used to be one element: the box the board measured itself
 * against with container units, and the cream surface the player sees. A size
 * container's box cannot be derived from its contents, so that one element had
 * to stretch - and every pixel the board did not take stayed cream. Measured on
 * 2026-09-21 against the dev server: 151px of it under tic-tac-toe's board at
 * 390x844, 255px under Connect Four's at 768x1024, 185px under Guess the Spy's
 * role panel at the same size, because each board stops at its own cap.
 *
 * The fix splits the two: `.ttt-board-card` still stretches and still carries
 * the container units, and `.ttt-board-surface` inside it is the painted card,
 * sized by the board. Merge them again and the bands come back, which is what
 * these two tests are here to catch - the nesting in the DOM, and the two CSS
 * rules that make the nesting mean anything.
 */
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/lobby/[code]/tic-tac-toe-page'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const mockChannel: {
  on: jest.Mock
  subscribe: jest.Mock
} = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn(() => mockChannel),
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, status: 'authenticated' }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null }),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

jest.mock('@/lib/fetch-with-guest', () => ({ fetchWithGuest: jest.fn() }))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({ finalizePendingLobbyCreateMetric: jest.fn() }))

jest.mock('@/lib/analytics', () => ({
  trackLobbyLeaveRedirect: jest.fn(),
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('@/components/ConfirmModal', () => ({ __esModule: true, default: () => null }))

jest.mock('@/lib/lobby-realtime-topic-client', () => ({
  fetchLobbyTopic: jest.fn(async (code: string) => `lobby:${code}:test-secret`),
}))

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(() => ({
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue({}),
  })),
}))

/** A live two-player game, straight out of the engine. */
function buildLobbyResponse() {
  const engine = new TicTacToeGame('game-1')
  engine.addPlayer({ id: 'user-1', name: 'Alice', score: 0, isActive: true })
  engine.addPlayer({ id: 'user-2', name: 'Bob', score: 0, isActive: true })
  engine.startGame()

  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'tic_tac_toe',
      creatorId: 'user-1',
      name: 'Lobby',
      isActive: false,
    },
    activeGame: {
      id: 'game-1',
      status: 'playing',
      currentTurn: 0,
      state: engine.getState(),
      players: [
        { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
      ],
    },
  }
}

describe('the board card does not paint the space the board leaves (#903)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>).mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('puts every tic-tac-toe board inside a surface, never straight in the card', async () => {
    const { container } = render(<TicTacToeLobbyPage code="ABCD" />)
    await waitFor(() => expect(screen.getByTestId('ttt-board')).toBeTruthy())

    const cards = Array.from(container.querySelectorAll('.ttt-board-card'))
    // The page renders a desktop, a phone-landscape and a mobile tree, so a
    // count of zero here would mean the render never reached the board and the
    // assertions below would pass on an empty list.
    expect(cards.length).toBeGreaterThan(0)

    for (const card of cards) {
      const surfaces = Array.from(card.children).filter((child) =>
        child.classList.contains('ttt-board-surface')
      )
      expect(surfaces).toHaveLength(1)

      // The board hangs off the surface, not off the card. If it hangs off the
      // card, the card is what sizes it and the card is what paints - the band.
      const boards = Array.from(card.querySelectorAll('.ttt-board-wrap'))
      expect(boards.length).toBeGreaterThan(0)
      for (const board of boards) {
        expect(board.closest('.ttt-board-surface')).toBe(surfaces[0])
      }
    }
  })

  it('leaves the container units on the card and the paint on the surface', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'app', 'globals.css'),
      'utf8'
    )

    /** The declarations of the first rule whose selector list is exactly `selector`. */
    const blockFor = (selector: string): string => {
      const start = css.indexOf(`\n${selector} {`)
      expect(start).toBeGreaterThan(-1)
      const open = css.indexOf('{', start)
      const close = css.indexOf('}', open)
      return css.slice(open + 1, close)
    }

    const card = blockFor('.ttt-board-card')
    const surface = blockFor('.ttt-board-surface')

    // The card measures. It must keep the container units, because the board's
    // own min() reads them - and it must not paint, because it stretches.
    expect(card).toContain('container-type: size')
    expect(card).not.toMatch(/(^|[;\s])background\s*:/)
    expect(card).not.toMatch(/(^|[;\s])padding\s*:/)

    // The surface paints. It must not become a size container, or it would stop
    // taking its height from the board and start stretching in the card's place.
    expect(surface).toMatch(/(^|[;\s])background\s*:/)
    expect(surface).toMatch(/(^|[;\s])padding\s*:/)
    expect(surface).not.toContain('container-type')
  })
})
