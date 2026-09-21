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
 * sized by the board.
 *
 * The review of the first round found three ways to undo that with everything
 * green, and one visible regression the split caused. All four are pinned here:
 *
 *  - the split was only asserted for tic-tac-toe, so Connect Four, Rock Paper
 *    Scissors and both Memory trees could be reverted silently. Every adopter is
 *    rendered below, and the check is structural rather than per-game: anything
 *    a board card holds that is not the one surface has to be an overlay layer.
 *  - `GameResultOverlay` is `position:absolute; inset:0` on the card, so once
 *    the card stopped painting the 82%-opaque slab hung over bare page - 904x502
 *    of it around a 501x501 board at 1280x800. The mount point now paints while
 *    the overlay is mounted, and that is asserted for every adopter.
 *  - the CSS check read only the FIRST rule whose selector matched, so appending
 *    `.ttt-board-card { background; padding }` at the end of the file - the exact
 *    regression, winning on cascade order - passed. It now reads every matching
 *    rule in the file.
 *  - nothing pinned `.ttt-board-surface`'s `padding: 12px`, which is where the
 *    107/125 in `--c4-cell` and the two 27px terms come from. The arithmetic is
 *    checked here, so changing one without the others fails.
 */
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import TicTacToeLobbyPage from '@/app/lobby/[code]/tic-tac-toe-page'
import ConnectFourLobbyPage from '@/app/lobby/[code]/connect-four-page'
import RockPaperScissorsLobbyPage from '@/app/lobby/[code]/rock-paper-scissors-page'
import MemoryGameBoard from '@/app/lobby/[code]/components/MemoryGameBoard'
import YahtzeeGameBoard from '@/app/lobby/[code]/components/YahtzeeGameBoard'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
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
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
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

// The three layout trees mount together and the hook elects the visible one
// (#1052); jsdom's matchMedia answers `matches: false` for both queries, so the
// elected tree is 'desktop'. Saying so here rather than relying on it keeps the
// Memory desktop assertions from turning into assertions about jsdom.
jest.mock('@/hooks/useActiveGameLayout', () => ({
  useActiveGameLayout: () => 'desktop',
}))

const PLAYERS = [
  { id: 'player-1', userId: 'user-1', name: 'Alice', score: 0, user: { username: 'Alice' } },
  { id: 'player-2', userId: 'user-2', name: 'Bob', score: 0, user: { username: 'Bob' } },
]

/** A live two-player tic-tac-toe game, straight out of the engine. */
function ticTacToeResponse(status: 'playing' | 'finished') {
  const engine = new TicTacToeGame('game-1')
  engine.addPlayer({ id: 'user-1', name: 'Alice', score: 0, isActive: true })
  engine.addPlayer({ id: 'user-2', name: 'Bob', score: 0, isActive: true })
  engine.startGame()

  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'tic_tac_toe', creatorId: 'user-1', name: 'Lobby', isActive: false },
    activeGame: { id: 'game-1', status, currentTurn: 0, state: engine.getState(), players: PLAYERS },
  }
}

function connectFourResponse(status: 'playing' | 'finished') {
  const board = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => null))
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'connect_four', creatorId: 'user-1', name: 'Lobby', isActive: false },
    activeGame: {
      id: 'game-1',
      gameType: 'connect_four',
      status,
      currentPlayerIndex: 0,
      state: {
        status,
        currentPlayerIndex: 0,
        players: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }],
        data: { board, currentDisc: 'red', winningLine: null, winnerId: null, lastDroppedRow: null, lastDroppedCol: null, moveHistory: [] },
      },
      players: PLAYERS,
    },
  }
}

function rockPaperScissorsResponse(status: 'playing' | 'finished') {
  return {
    lobby: { id: 'lobby-1', code: 'ABCD', gameType: 'rock_paper_scissors', creatorId: 'user-1', name: 'Lobby', isActive: true },
    activeGame: {
      id: 'game-1',
      gameType: 'rock_paper_scissors',
      status,
      currentPlayerIndex: 0,
      state: {
        status,
        currentPlayerIndex: 0,
        players: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }],
        data: {
          mode: 'best-of-3',
          rounds: [],
          playerChoices: {},
          scores: {},
          playersReady: [],
          gameWinner: status === 'finished' ? 'user-1' : null,
        },
      },
      players: PLAYERS,
    },
  }
}

function memoryState(status: 'playing' | 'finished') {
  const cards = Array.from({ length: 16 }, (_, i) => ({
    id: `c${i}`,
    value: String(Math.floor(i / 2)),
    isMatched: status === 'finished',
    isFlipped: false,
  }))
  return {
    status,
    currentPlayerIndex: 0,
    players: [{ id: 'user-1', name: 'Alice' }, { id: 'user-2', name: 'Bob' }],
    data: {
      difficulty: 'easy',
      gridColumns: 4,
      gridRows: 4,
      cards,
      flippedCardIds: [],
      pendingMismatchCardIds: [],
      scores: { 'user-1': 5, 'user-2': 3 },
      winnerId: status === 'finished' ? 'user-1' : null,
      advanceTurnAfterMove: true,
      moveHistory: [],
    },
  }
}

function renderMemory(status: 'playing' | 'finished') {
  return render(
    <MemoryGameBoard
      gameId="game-1"
      lobbyCode="ABCD"
      state={memoryState(status)}
      players={PLAYERS as never}
      currentUserId="user-1"
      canStartGame
    />
  )
}

/**
 * Every element a board card holds that is not the one painted surface has to
 * be an overlay layer - the result overlay, or the "show results" pill. Both
 * carry an inline `position: absolute`, because they are drawn over the board
 * rather than laid out beside it.
 *
 * Stated this way the check needs no per-game board selector, which is the
 * point: the first round asserted `.ttt-board-wrap` and so covered only
 * tic-tac-toe, and the reviewer reverted Connect Four, Rock Paper Scissors and
 * both Memory call sites with every suite still green.
 */
function expectBoardIsInsideASurface(card: Element) {
  const children = Array.from(card.children)
  const surfaces = children.filter((child) => child.classList.contains('ttt-board-surface'))
  expect(surfaces).toHaveLength(1)

  for (const child of children) {
    if (child === surfaces[0]) continue
    expect((child as HTMLElement).style.position).toBe('absolute')
  }
}

/**
 * The overlay is `position:absolute; inset:0` on its mount point, so the mount
 * point is what the 82%-opaque slab is shaped like. If it does not paint, the
 * slab hangs over bare page - the review's blocker.
 */
const PAINTED_WHILE_RESULT_SHOWN = ['ttt-board-card--result', 'memory-board-panel--result', 'spy-board-card']

function expectResultOverlayHasAPaintedMount(container: HTMLElement) {
  const overlays = Array.from(container.querySelectorAll('[data-testid="game-result-overlay"]'))
  expect(overlays.length).toBeGreaterThan(0)
  for (const overlay of overlays) {
    const mount = overlay.parentElement as HTMLElement
    expect(mount).toBeTruthy()
    const painted = PAINTED_WHILE_RESULT_SHOWN.some((cls) => mount.classList.contains(cls))
    if (!painted) {
      throw new Error(
        `the result overlay is mounted on <${mount.tagName.toLowerCase()} class="${mount.className}">, ` +
        `which paints nothing - the slab would hang over bare page (#903 review). ` +
        `Expected one of: ${PAINTED_WHILE_RESULT_SHOWN.join(', ')}`
      )
    }
  }
}

describe('the board card does not paint the space the board leaves (#903)', () => {
  const mockFetch = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>

  const respondWith = (body: unknown) => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => body } as Response)
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('every board sits inside a surface, never straight in the card', () => {
    it('tic-tac-toe', async () => {
      respondWith(ticTacToeResponse('playing'))
      const { container } = render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getAllByTestId('ttt-board').length).toBeGreaterThan(0))

      const cards = Array.from(container.querySelectorAll('.ttt-board-card'))
      expect(cards.length).toBeGreaterThan(0)
      cards.forEach(expectBoardIsInsideASurface)

      // The board hangs off the surface, not off the card.
      const boards = Array.from(container.querySelectorAll('.ttt-board-wrap'))
      expect(boards.length).toBeGreaterThan(0)
      for (const board of boards) expect(board.closest('.ttt-board-surface')).toBeTruthy()
    })

    it('connect four', async () => {
      respondWith(connectFourResponse('playing'))
      const { container } = render(<ConnectFourLobbyPage code="ABCD" />)
      await waitFor(() => expect(container.querySelectorAll('.ttt-board-card').length).toBeGreaterThan(0))

      const cards = Array.from(container.querySelectorAll('.ttt-board-card'))
      cards.forEach(expectBoardIsInsideASurface)
    })

    it('rock paper scissors', async () => {
      respondWith(rockPaperScissorsResponse('playing'))
      const { container } = render(<RockPaperScissorsLobbyPage code="ABCD" />)
      await waitFor(() => expect(container.querySelectorAll('.ttt-board-card').length).toBeGreaterThan(0))

      const cards = Array.from(container.querySelectorAll('.ttt-board-card'))
      cards.forEach(expectBoardIsInsideASurface)

      // RPS's composition is elastic, not a fixed-aspect grid: hugging it on
      // both axes collapsed `.rps-stage` from 640px to 387px at 1280x800 and
      // left 491px of horizontal slack. Its surface takes the card's width.
      const boards = Array.from(container.querySelectorAll('.rps-board'))
      expect(boards.length).toBeGreaterThan(0)
      for (const board of boards) {
        const surface = board.closest('.ttt-board-surface')
        expect(surface).toBeTruthy()
        expect(surface!.classList.contains('ttt-board-surface--wide')).toBe(true)
      }
    })

    it('memory', async () => {
      const { container } = renderMemory('playing')
      await waitFor(() => expect(container.querySelectorAll('.memory-grid').length).toBeGreaterThan(0))

      // Desktop's panel is the size container; the mobile and landscape trees
      // use `.memory-mobile-board-wrap` for the same job.
      const panels = Array.from(container.querySelectorAll('.memory-board-panel, .memory-mobile-board-wrap'))
      expect(panels.length).toBeGreaterThan(0)
      for (const panel of panels) {
        const surfaces = Array.from(panel.children).filter((c) => c.classList.contains('ttt-board-surface'))
        expect(surfaces).toHaveLength(1)
      }

      const grids = Array.from(container.querySelectorAll('.memory-grid'))
      expect(grids.length).toBeGreaterThan(0)
      for (const grid of grids) expect(grid.closest('.ttt-board-surface')).toBeTruthy()
    })
  })

  describe('the finished-game overlay always has a card under it', () => {
    it('tic-tac-toe', async () => {
      respondWith(ticTacToeResponse('finished'))
      const { container } = render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() =>
        expect(container.querySelectorAll('[data-testid="game-result-overlay"]').length).toBeGreaterThan(0)
      )
      expectResultOverlayHasAPaintedMount(container)
    })

    it('connect four', async () => {
      respondWith(connectFourResponse('finished'))
      const { container } = render(<ConnectFourLobbyPage code="ABCD" />)
      await waitFor(() =>
        expect(container.querySelectorAll('[data-testid="game-result-overlay"]').length).toBeGreaterThan(0)
      )
      expectResultOverlayHasAPaintedMount(container)
    })

    it('rock paper scissors', async () => {
      respondWith(rockPaperScissorsResponse('finished'))
      const { container } = render(<RockPaperScissorsLobbyPage code="ABCD" />)
      await waitFor(() =>
        expect(container.querySelectorAll('[data-testid="game-result-overlay"]').length).toBeGreaterThan(0)
      )
      expectResultOverlayHasAPaintedMount(container)
    })

    it('memory, desktop', async () => {
      const { container } = renderMemory('finished')
      await waitFor(() =>
        expect(container.querySelectorAll('[data-testid="game-result-overlay"]').length).toBeGreaterThan(0)
      )
      expectResultOverlayHasAPaintedMount(container)
    })

    it('and the card is back to painting nothing while the game is being played', async () => {
      respondWith(ticTacToeResponse('playing'))
      const { container } = render(<TicTacToeLobbyPage code="ABCD" />)
      await waitFor(() => expect(screen.getAllByTestId('ttt-board').length).toBeGreaterThan(0))

      expect(container.querySelectorAll('[data-testid="game-result-overlay"]')).toHaveLength(0)
      expect(container.querySelectorAll('.ttt-board-card--result')).toHaveLength(0)
    })
  })

  describe('yahtzee hugs its dice instead of stretching around them (#903)', () => {
    function renderYahtzee(compact: boolean) {
      const engine = new YahtzeeGame('game-1')
      engine.addPlayer({ id: 'user-1', name: 'Alice', score: 0, isActive: true })
      engine.addPlayer({ id: 'user-2', name: 'Bob', score: 0, isActive: true })
      engine.startGame()

      return render(
        <YahtzeeGameBoard
          gameEngine={engine}
          game={{ id: 'game-1' } as never}
          isMyTurn
          timeLeft={60}
          turnTimerLimit={60}
          isMoveInProgress={false}
          isRolling={false}
          isScoring={false}
          isStateReverting={false}
          celebrationEvent={null}
          held={[false, false, false, false, false]}
          getCurrentUserId={() => 'user-1'}
          onRollDice={() => undefined}
          onToggleHold={() => undefined}
          onScore={() => undefined}
          onCelebrationComplete={() => undefined}
          compact={compact}
        />
      )
    }

    // #903 names YahtzeeGameBoard.tsx:106,129 as one of its two causes and
    // measures the result twice. On the branch at 768x1024 the card was 744x797
    // around a 112px dice strip - ~197px of empty card above it and ~246px
    // below. `flex-1` on either box is what put it there.
    it('neither the dice card nor the dice box takes the column\'s spare height', () => {
      for (const compact of [false, true]) {
        const { container, unmount } = renderYahtzee(compact)

        const card = container.querySelector('.bd-card')
        expect(card).toBeTruthy()
        expect(card!.className).not.toMatch(/(^|\s)flex-1(\s|$)/)
        // It still shrinks and scrolls when the column is shorter than the
        // content - the iOS Safari address-bar case the file documents.
        expect(card!.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/)
        expect(card!.className).toMatch(/(^|\s)min-h-0(\s|$)/)

        const diceBox = card!.querySelector(compact ? '.min-h-\\[110px\\]' : '.min-h-\\[190px\\]')
        expect(diceBox).toBeTruthy()
        expect((diceBox as HTMLElement).className).not.toMatch(/(^|\s)flex-1(\s|$)/)

        unmount()
      }
    })

    it('centres what is left, so the freed height is page padding and not empty card', () => {
      const { container } = renderYahtzee(false)
      const root = container.firstElementChild as HTMLElement
      expect(root.className).toMatch(/(^|\s)justify-center(\s|$)/)
    })
  })

  describe('the CSS rules that make the nesting mean anything', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')

    /**
     * The declarations of EVERY rule whose selector list contains `selector` as
     * one of its comma-separated parts, anywhere in the file - including inside
     * an `@media` block, and including a rule appended after the one the fix
     * lives in.
     *
     * The first round took only the first match. Appending
     * `.ttt-board-card { background: #FFF8EC; padding: 12px }` to the end of the
     * file - which wins on cascade order and restores the exact band #903 is
     * about - passed, because the assertion never saw it.
     */
    const blocksFor = (selector: string): string[] => {
      const blocks: string[] = []
      let depth = 0
      let selectorStart = 0
      for (let i = 0; i < css.length; i++) {
        const ch = css[i]
        if (ch === '{') {
          if (depth === 0) {
            const prelude = css.slice(selectorStart, i)
            const close = css.indexOf('}', i)
            const parts = prelude.split(',').map((part) => part.trim())
            if (parts.includes(selector)) blocks.push(css.slice(i + 1, close))
          }
          depth++
        } else if (ch === '}') {
          depth = Math.max(0, depth - 1)
          if (depth === 0) selectorStart = i + 1
        } else if (ch === ';' && depth === 0) {
          selectorStart = i + 1
        }
      }
      return blocks
    }

    /** Nested rules (inside `@media`) are reached by walking the block. */
    const allBlocksFor = (selector: string): string[] => {
      const direct = blocksFor(selector)
      const nested: string[] = []
      const re = new RegExp(`(^|[,{}\\n])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*(,[^{}]*)?\\{`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(css)) !== null) {
        const open = css.indexOf('{', m.index + m[0].length - 1)
        const close = css.indexOf('}', open)
        const body = css.slice(open + 1, close)
        if (!direct.includes(body)) nested.push(body)
      }
      return [...direct, ...nested]
    }

    const paints = (block: string) => /(^|[;\s])background(-color)?\s*:/.test(block)
    const pads = (block: string) => /(^|[;\s])padding\s*:/.test(block)

    it('leaves the container units on the card and lets nothing put the paint back', () => {
      const cardBlocks = allBlocksFor('.ttt-board-card')
      expect(cardBlocks.length).toBeGreaterThan(0)
      expect(cardBlocks.some((b) => b.includes('container-type: size'))).toBe(true)

      // Every rule in the file, not just the first one.
      for (const block of cardBlocks) {
        expect(paints(block)).toBe(false)
        expect(pads(block)).toBe(false)
      }
    })

    it('puts the paint on the surface, and keeps the surface out of the sizing', () => {
      const surfaceBlocks = allBlocksFor('.ttt-board-surface')
      expect(surfaceBlocks.length).toBeGreaterThan(0)
      expect(surfaceBlocks.some(paints)).toBe(true)
      expect(surfaceBlocks.some(pads)).toBe(true)
      // It must not become a size container, or it would stop taking its height
      // from the board and start stretching in the card's place.
      for (const block of surfaceBlocks) expect(block).not.toContain('container-type')
    })

    it('paints the overlay mount points for as long as the overlay is mounted', () => {
      for (const selector of ['.ttt-board-card--result', '.memory-board-panel--result']) {
        const blocks = allBlocksFor(selector)
        expect(blocks.length).toBeGreaterThan(0)
        expect(blocks.some(paints)).toBe(true)
        // A border here would change the size container's content box, and
        // --c4-cell reads it, so the board would shift as the game ends.
        for (const block of blocks) expect(block).not.toMatch(/(^|[;\s])border\s*:/)
      }
    })

    it('keeps the three hardcoded constants in step with the surface padding', () => {
      const surface = allBlocksFor('.ttt-board-surface').join('\n')
      const padding = /(^|[;\s])padding\s*:\s*(\d+)px/.exec(surface)
      const border = /(^|[;\s])border\s*:\s*([\d.]+)px/.exec(surface)
      expect(padding).toBeTruthy()
      expect(border).toBeTruthy()

      // The surface's own chrome on one axis: two paddings and two borders.
      const chrome = 2 * Number(padding![2]) + 2 * Number(border![2])
      expect(chrome).toBe(27)

      const card = allBlocksFor('.ttt-board-card').join('\n')
      const cell = /--c4-cell:[^;]*100cqw - (\d+)px\)\s*\/\s*7\)[^;]*100cqh - (\d+)px\)\s*\/\s*6\)/.exec(card)
      expect(cell).toBeTruthy()
      // 107 = the C4 grid's own 80px of chrome + the surface's 27.
      expect(Number(cell![1])).toBe(80 + chrome)
      // 125 = the same on the other axis, where the grid's chrome is 98.
      expect(Number(cell![2])).toBe(98 + chrome)

      // .ttt-board-wrap and .memory-grid both subtract the surface's chrome.
      const wrap = allBlocksFor('.ttt-board-wrap').join('\n')
      expect(wrap).toContain(`100cqw - ${chrome}px`)
      expect(wrap).toContain(`100cqh - ${chrome}px`)
      const grid = allBlocksFor('.memory-grid').join('\n')
      expect(grid).toContain(`100cqw - ${chrome}px`)
      expect(grid).toContain(`100cqh - ${chrome}px`)
    })

    it('keeps Guess the Spy\'s half of the fix - the card takes its content\'s height', () => {
      const blocks = allBlocksFor('.ttt-center-col > .spy-board-card')
      expect(blocks.length).toBeGreaterThan(0)
      for (const block of blocks) {
        expect(block).toMatch(/flex:\s*0 1 auto/)
        expect(block).not.toMatch(/flex:\s*1 1 auto/)
      }
      // The rule has to cover all three trees, or the band comes back in the
      // one it missed - it was 185px at 768x1024 and 103px at 844x390.
      for (const selector of ['.game-landscape-board > .spy-board-card', '.ttt-mobile-content > .spy-board-card']) {
        expect(allBlocksFor(selector).some((b) => /flex:\s*0 1 auto/.test(b))).toBe(true)
      }
    })

    it('stops the RPS composition being laid out down a card it no longer fills', () => {
      const blocks = allBlocksFor('.rps-board')
      expect(blocks.length).toBeGreaterThan(0)
      for (const block of blocks) {
        // Its parent is `.ttt-board-surface--wide`, which has no definite
        // height, so a percentage height resolves to nothing and
        // `space-evenly` has no free space to spread into. Both were dead.
        expect(block).not.toMatch(/(^|[;\s])height\s*:\s*100%/)
        expect(block).not.toMatch(/justify-content:\s*space-evenly/)
      }
      expect(allBlocksFor('.ttt-board-surface--wide').some((b) => /width:\s*100%/.test(b))).toBe(true)
    })
  })
})
