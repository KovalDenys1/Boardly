import { render, screen, fireEvent, act, within } from '@testing-library/react'
import GameResultOverlay, {
  RESULT_REVEAL_DELAY_MS,
  resetResultOverlayRevealState,
} from '@/components/game-chrome/GameResultOverlay'
import { hasFinishedGame, resetFinishedGameNote } from '@/lib/finished-game'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars && 'rank' in vars ? `${key}:${String(vars.rank)}` : key,
  }),
}))

jest.mock('@/components/game-chrome/AfterGameActions', () => {
  return function MockAfterGameActions(props: { variant?: string; inviteCode?: string }) {
    return (
      <div data-testid="after-game-actions" data-variant={props.variant}>
        {props.inviteCode && <button type="button">game.ui.playAgainWithFriends</button>}
        <a href="/discord">game.ui.discordAfterGame</a>
      </div>
    )
  }
})

jest.mock('@/hooks/useRematchSignal', () => ({
  useRematchSignal: () => ({ requestedBy: null, askState: 'idle', ask: jest.fn() }),
}))

const base = {
  title: 'Alice wins!',
  onInspect: jest.fn(),
  isHost: true,
  onPlayAgain: jest.fn(),
  onReturnToLobby: jest.fn(),
  onLeave: jest.fn(),
  gameType: 'tic_tac_toe' as const,
  revealDelayMs: 0,
}

const versus = [
  { id: 'a', name: 'Alice', score: 3, isViewer: true },
  { id: 'b', name: 'Bot', score: 1 },
]

const table = [
  { id: 'a', name: 'Alice', score: 41 },
  { id: 'b', name: 'Bea', score: 37 },
  { id: 'c', name: 'Cid', score: 30 },
  { id: 'd', name: 'Dan', score: 22 },
  { id: 'e', name: 'Eve', score: 18 },
  { id: 'f', name: 'Fay', score: 9, isViewer: true },
]

const dialog = () => screen.getByRole('dialog')

function setReducedMotion(reduce: boolean) {
  ;(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  })
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  jest.clearAllMocks()
  resetResultOverlayRevealState()
  resetFinishedGameNote()
  setReducedMotion(false)
})

afterEach(() => {
  ;(window as unknown as { matchMedia: unknown }).matchMedia = originalMatchMedia
})

describe('the end screen reads as the end of a game (#1578)', () => {
  it('a win names the winner first, shows the score, and celebrates', () => {
    render(<GameResultOverlay {...base} outcome="win" standings={versus} />)
    const panel = dialog()
    expect(panel).toHaveAttribute('data-outcome', 'win')
    expect(within(panel).getByRole('heading', { name: 'Alice wins!' })).toBeInTheDocument()
    expect(screen.getByTestId('game-result-celebration')).toBeInTheDocument()

    const score = screen.getByTestId('game-result-standings')
    expect(score).toHaveAttribute('data-layout', 'versus')
    expect(within(score).getByText('3')).toBeInTheDocument()
    expect(within(score).getByText('1')).toBeInTheDocument()

    // Read in this order: who won, the score, then what to do next.
    const heading = within(panel).getByRole('heading')
    const actions = screen.getByTestId('game-result-actions')
    expect(heading.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(score.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a draw has its own state: the handshake, no celebration', () => {
    render(<GameResultOverlay {...base} title="It's a draw" isDraw outcome="draw" standings={versus} />)
    expect(dialog()).toHaveAttribute('data-outcome', 'draw')
    expect(dialog().querySelector('[data-icon="handshake"]')).toBeTruthy()
    expect(screen.queryByTestId('game-result-celebration')).toBeNull()
  })

  it('a loss has its own state: no celebration for the player who lost', () => {
    render(<GameResultOverlay {...base} title="Bot wins!" outcome="loss" standings={versus} />)
    expect(dialog()).toHaveAttribute('data-outcome', 'loss')
    expect(screen.queryByTestId('game-result-celebration')).toBeNull()
  })

  it('three or more players get ranked standings that always include the viewer', () => {
    render(<GameResultOverlay {...base} title="Alice wins!" outcome="loss" standings={table} />)
    const list = screen.getByTestId('game-result-standings')
    expect(list).toHaveAttribute('data-layout', 'ranked')
    const rows = within(list).getAllByRole('listitem')
    // Five rows fit every screen: the top four and the viewer's own place.
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('Alice')
    expect(rows[0]).toHaveTextContent('41')
    expect(rows[4]).toHaveTextContent('Fay')
    expect(rows[4]).toHaveTextContent('game.ui.resultRank:6')
    expect(rows[4]).toHaveAttribute('data-viewer', 'true')
  })

  it('a solo game shows the one score, large', () => {
    render(<GameResultOverlay {...base} title="Game over" standings={[{ id: 'a', name: 'Alice', score: 187, isViewer: true }]} />)
    const list = screen.getByTestId('game-result-standings')
    expect(list).toHaveAttribute('data-layout', 'solo')
    expect(list).toHaveTextContent('187')
  })

  it('without standings the title stands alone, with no empty score block', () => {
    render(<GameResultOverlay {...base} outcome="win" />)
    expect(screen.queryByTestId('game-result-standings')).toBeNull()
  })
})

describe('one clear next step (#1564)', () => {
  it('shows at most three actions, Play again first, the rest behind More', () => {
    render(
      <GameResultOverlay {...base} inviteCode="AB12" isGuest gameId="g1" standings={versus} />
    )
    const actions = screen.getByTestId('game-result-actions')
    const visible = within(actions).getAllByRole('button')
    expect(visible.length).toBeLessThanOrEqual(3)
    expect(visible.map((b) => b.textContent)).toEqual([
      'lobby.game.playAgain',
      'game.ui.viewBoard',
      'game.ui.resultMore',
    ])
    expect(screen.queryByRole('link', { name: 'game.ui.discordAfterGame' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'game.ui.leave' })).toBeNull()
  })

  it('More holds Return to lobby, Leave, sharing and Discord; Back returns', () => {
    render(<GameResultOverlay {...base} inviteCode="AB12" isGuest />)
    fireEvent.click(screen.getByRole('button', { name: 'game.ui.resultMore' }))

    const more = screen.getByTestId('game-result-more')
    expect(within(more).getByRole('button', { name: 'game.ui.returnToLobby' })).toBeInTheDocument()
    expect(within(more).getByRole('button', { name: 'game.ui.playAgainWithFriends' })).toBeInTheDocument()
    expect(within(more).getByRole('link', { name: 'game.ui.discordAfterGame' })).toBeInTheDocument()
    expect(within(more).getByTestId('after-game-actions')).toHaveAttribute('data-variant', 'menu')

    fireEvent.click(within(more).getByRole('button', { name: 'game.ui.leave' }))
    expect(base.onLeave).toHaveBeenCalled()

    fireEvent.click(within(more).getByRole('button', { name: 'game.ui.resultBack' }))
    expect(screen.queryByTestId('game-result-more')).toBeNull()
    expect(screen.getByRole('button', { name: 'game.ui.resultMore' })).toHaveFocus()
  })

  it('a non-host still gets three at most: the rematch ask, View board, More', () => {
    render(<GameResultOverlay {...base} isHost={false} isGuest inviteCode="AB12" />)
    const visible = within(screen.getByTestId('game-result-actions')).getAllByRole('button')
    expect(visible.map((b) => b.textContent)).toEqual([
      'game.ui.askRematch',
      'game.ui.viewBoard',
      'game.ui.resultMore',
    ])
  })

  it('notes that this browser finished a game, which keeps onboarding away', () => {
    expect(hasFinishedGame()).toBe(false)
    render(<GameResultOverlay {...base} isGuest />)
    expect(hasFinishedGame()).toBe(true)
  })
})

describe('it is a dialog: focus, Escape, one scrim (#1549 rule for this overlay)', () => {
  it('is a modal dialog named by the result, and focus moves into it', () => {
    render(<GameResultOverlay {...base} standings={versus} />)
    const panel = dialog()
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(panel).toHaveAccessibleName('Alice wins!')
    expect(panel.contains(document.activeElement)).toBe(true)
  })

  it('keeps Tab inside: past the last control it wraps to the first, and back', () => {
    render(<GameResultOverlay {...base} />)
    const play = screen.getByRole('button', { name: 'lobby.game.playAgain' })
    const more = screen.getByRole('button', { name: 'game.ui.resultMore' })

    more.focus()
    fireEvent.keyDown(more, { key: 'Tab' })
    expect(play).toHaveFocus()

    fireEvent.keyDown(play, { key: 'Tab', shiftKey: true })
    expect(more).toHaveFocus()
  })

  it('Escape closes it to View board', () => {
    render(<GameResultOverlay {...base} />)
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(base.onInspect).toHaveBeenCalledTimes(1)
  })

  it('makes the page behind it inert while it is open, and gives it back after', () => {
    const page = document.createElement('main')
    page.innerHTML = '<button>Board cell</button>'
    document.body.appendChild(page)
    try {
      const { unmount } = render(<GameResultOverlay {...base} />)
      expect(page).toHaveAttribute('inert')
      unmount()
      expect(page).not.toHaveAttribute('inert')
    } finally {
      page.remove()
    }
  })

  it('is neither modal nor focused while it waits for the finishing move', () => {
    jest.useFakeTimers()
    try {
      render(<GameResultOverlay {...base} revealDelayMs={RESULT_REVEAL_DELAY_MS} />)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.body).toHaveFocus()
      act(() => { jest.advanceTimersByTime(RESULT_REVEAL_DELAY_MS) })
      expect(dialog().contains(document.activeElement)).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('renders one dialog when a page mounts the overlay in several layout trees', () => {
    render(
      <>
        <GameResultOverlay {...base} />
        <GameResultOverlay {...base} />
        <GameResultOverlay {...base} />
      </>
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getAllByTestId('game-result-scrim')).toHaveLength(1)
  })
})

describe('the entrance (#1578)', () => {
  type AnimateCall = { part: string | null; keyframes: Keyframe[]; options: KeyframeAnimationOptions }
  let calls: AnimateCall[]
  const originalAnimate = HTMLElement.prototype.animate

  beforeEach(() => {
    calls = []
    HTMLElement.prototype.animate = function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ part: this.getAttribute('data-entrance'), keyframes, options })
      return { cancel: jest.fn(), finish: jest.fn() } as unknown as Animation
    } as typeof HTMLElement.prototype.animate
  })

  afterEach(() => {
    HTMLElement.prototype.animate = originalAnimate
  })

  const end = (c: AnimateCall) => Number(c.options.delay ?? 0) + Number(c.options.duration ?? 0)

  it('stages scrim, card, result and actions in that order, all done inside 600 ms', () => {
    render(<GameResultOverlay {...base} outcome="win" standings={versus} />)
    const order = ['scrim', 'card', 'result', 'actions']
    const staged = order.map((part) => calls.find((c) => c.part === part))
    staged.forEach((c, i) => expect(c).toBeDefined())
    const delays = staged.map((c) => Number(c!.options.delay ?? 0))
    expect([...delays].sort((a, b) => a - b)).toEqual(delays)
    expect(new Set(delays).size).toBeGreaterThan(2)
    calls.forEach((c) => expect(end(c)).toBeLessThan(600))
    // The card moves, not just fades in.
    expect(staged[1]!.keyframes.some((k) => 'transform' in k)).toBe(true)
  })

  it('under reduced motion it is one plain fade, with nothing moving', () => {
    setReducedMotion(true)
    render(<GameResultOverlay {...base} outcome="win" standings={versus} />)
    expect(calls.length).toBeGreaterThan(0)
    calls.forEach((c) => c.keyframes.forEach((k) => {
      expect(Object.keys(k).filter((key) => key !== 'offset' && key !== 'easing')).toEqual(['opacity'])
    }))
  })
})
