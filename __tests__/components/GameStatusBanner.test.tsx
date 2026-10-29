import { readFileSync } from 'fs'
import path from 'path'
import postcss, { type AtRule } from 'postcss'
import { render, screen } from '@testing-library/react'
import GameStatusBanner from '@/components/game-chrome/GameStatusBanner'
import { playCue } from '@/lib/sound-engine'
import { liveFinishWithin, resetLiveFinish } from '@/lib/live-finish'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('GameStatusBanner (#736 phase 4)', () => {
  const base = {
    isFinished: false,
    activeTitle: "Alice's turn",
    secs: 45,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
  }

  it('renders the active-turn banner with timer and meta', () => {
    render(<GameStatusBanner {...base} meta="#5" />)
    expect(screen.getByText("Alice's turn")).toBeTruthy()
    expect(screen.getByText('#5')).toBeTruthy()
    expect(screen.getByText(':45')).toBeTruthy()
  })

  it('shows 96 seconds as 1:36, not :96 (#1491)', () => {
    render(<GameStatusBanner {...base} secs={96} turnTimerLimit={120} />)
    expect(screen.getByText('1:36')).toBeTruthy()
    expect(screen.queryByText(':96')).toBeNull()
  })

  it('renders the victory plate for the winner', () => {
    render(<GameStatusBanner {...base} isFinished outcome="win" finishedMessage="Alice wins!" />)
    expect(screen.getByText('game.ui.victoryBadge')).toBeTruthy()
    expect(screen.getByText('Alice wins!')).toBeTruthy()
    expect(screen.queryByText(':45')).toBeNull()
  })

  it('tells the loser it is a defeat, never a victory (#1340)', () => {
    render(<GameStatusBanner {...base} isFinished outcome="loss" finishedMessage="Grid Rookie wins!" />)
    expect(screen.getByText('game.ui.defeatBadge')).toBeTruthy()
    expect(screen.queryByText('game.ui.victoryBadge')).toBeNull()
  })

  it('shows the neutral badge when the caller does not say who is looking (#1340)', () => {
    render(<GameStatusBanner {...base} isFinished finishedMessage="Grid Rookie wins!" />)
    expect(screen.getByText('game.ui.gameOverBadge')).toBeTruthy()
    expect(screen.queryByText('game.ui.victoryBadge')).toBeNull()
  })

  it('shows a spectator the neutral badge even with an outcome passed (#1340)', () => {
    render(<GameStatusBanner {...base} isFinished isSpectator outcome="win" finishedMessage="Alice wins!" />)
    expect(screen.getByText('game.ui.gameOverBadge')).toBeTruthy()
  })

  it('renders the draw plate when finished with a draw', () => {
    render(<GameStatusBanner {...base} isFinished isDraw finishedMessage="It's a tie" />)
    expect(screen.getByText('game.ui.drawBadge')).toBeTruthy()
    expect(screen.getByText("It's a tie")).toBeTruthy()
  })

  it('renders the spectator variant without a timer', () => {
    render(<GameStatusBanner {...base} isSpectator />)
    expect(screen.getByText('game.ui.spectatingBadge')).toBeTruthy()
    expect(document.querySelector('[data-icon="eye"]')).toBeTruthy()
    expect(screen.queryByText(':45')).toBeNull()
  })
})

describe('GameStatusBanner idle nudge (#817)', () => {
  const base = {
    isFinished: false,
    activeTitle: 'Your turn',
    secs: 60,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
  }

  it('stays quiet while the acting player still has most of their turn', () => {
    render(<GameStatusBanner {...base} isYourTurn secs={50} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
    // The live region is already there, empty, so the hint is announced when it lands.
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('speaks up once the acting player has sat on their turn', () => {
    // A third of abandoned games never record a single move, and the roster
    // shows both players were present when the clock started — the turn timer
    // used to run out in silence.
    render(<GameStatusBanner {...base} isYourTurn secs={45} />)
    expect(screen.getByText('game.ui.firstMoveNudge')).toBeTruthy()
  })

  it('adds no block under the banner (#1343)', () => {
    const { container } = render(<GameStatusBanner {...base} isYourTurn secs={45} />)
    expect(container.childElementCount).toBe(1)
    const banner = container.firstElementChild as HTMLElement
    expect(banner.getAttribute('data-idle')).toBe('true')
    expect(banner.className).toBe('game-status-banner')
    expect(screen.getByRole('status').textContent).toBe('game.ui.firstMoveNudge')
  })

  it('never nudges a player who is not the one to move', () => {
    render(<GameStatusBanner {...base} isYourTurn={false} secs={10} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })

  it('does not nudge when no turn timer is configured', () => {
    // Without a limit there is no elapsed time to measure against.
    render(<GameStatusBanner {...base} isYourTurn secs={0} turnTimerLimit={0} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })
})

describe('GameStatusBanner clock and untimed phases (#905)', () => {
  const base = {
    isFinished: false,
    activeTitle: 'Question round',
    secs: 45,
    turnTimerLimit: 60,
    barColor: 'var(--bd-lav)',
  }

  it('prints minutes once the clock passes 99 seconds', () => {
    // Guess the Spy's question round is 300s; every earlier adopter ran 30-120s.
    render(<GameStatusBanner {...base} secs={291} turnTimerLimit={300} />)
    expect(screen.getByText('4:51')).toBeTruthy()
    expect(screen.queryByText(':291')).toBeNull()
  })

  it('still prints a two-digit turn timer under 100 seconds', () => {
    render(<GameStatusBanner {...base} secs={7} />)
    expect(screen.getByText(':07')).toBeTruthy()
  })

  it('shows neither clock nor bar on a phase with no deadline', () => {
    const { container } = render(
      <GameStatusBanner {...base} showTimer={false} secs={0} turnTimerLimit={0} activeTitle="0/3 players ready" />
    )
    expect(screen.getByText('0/3 players ready')).toBeTruthy()
    expect(screen.queryByText(':00')).toBeNull()
    expect(container.querySelector('[data-testid="game-status-timer-bar"]')).toBeNull()
  })

  /**
   * The shape Alias actually passes (alias-page.tsx describer and guesser
   * screens): showTimer={false} because the countdown ring below is the game's
   * clock, and turnTimerLimit={60} because there IS a deadline - it is just
   * drawn somewhere else. The first version of this test passed
   * turnTimerLimit={0}, which the pre-existing `turnTimerLimit > 0` term
   * already killed, so it held with the new `showTimer &&` term deleted (#905
   * review). Both halves are asserted here: with the clock shown, the same
   * numbers must still raise the nudge, or the test is proving nothing but
   * that 25 < 15.
   */
  const idleShape = { ...base, isYourTurn: true, secs: 35, turnTimerLimit: 60 }

  it('keeps the idle nudge off a banner whose clock is drawn elsewhere', () => {
    render(<GameStatusBanner {...idleShape} showTimer={false} />)
    expect(screen.queryByText('game.ui.firstMoveNudge')).toBeNull()
  })

  it('still raises the idle nudge on the same turn when the banner owns the clock', () => {
    render(<GameStatusBanner {...idleShape} />)
    expect(screen.getByText('game.ui.firstMoveNudge')).toBeTruthy()
  })
})

describe('GameStatusBanner motion (#1111)', () => {
  const base = {
    isFinished: false,
    activeTitle: "Alice's turn",
    secs: 30,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
  }

  it('remounts the title with the cue class when the turn changes', () => {
    const { rerender } = render(<GameStatusBanner {...base} />)
    const first = screen.getByTestId('game-status-title')
    expect(first.className).toContain('game-status-cue')

    rerender(<GameStatusBanner {...base} secs={29} />)
    // A timer tick is not a turn change: same node, no replayed cue.
    expect(screen.getByTestId('game-status-title')).toBe(first)

    rerender(<GameStatusBanner {...base} activeTitle="Your turn" />)
    const second = screen.getByTestId('game-status-title')
    expect(second).not.toBe(first)
    expect(second.className).toContain('game-status-cue')
    expect(second.textContent).toContain('Your turn')
  })

  it('cues the spectator line and the finished plate too', () => {
    const { rerender } = render(<GameStatusBanner {...base} isSpectator />)
    const spectating = screen.getByTestId('game-status-title')
    rerender(<GameStatusBanner {...base} isSpectator activeTitle="Bob's turn" />)
    expect(screen.getByTestId('game-status-title')).not.toBe(spectating)

    rerender(<GameStatusBanner {...base} isFinished finishedMessage="Alice wins!" />)
    expect(screen.getByTestId('game-status-title').className).toContain('game-status-cue')
  })

  it('drives the timer bar with scaleX from the left, never width', () => {
    const { rerender } = render(<GameStatusBanner {...base} />)
    const bar = screen.getByTestId('game-status-timer-bar')
    expect(bar.style.transform).toBe('scaleX(0.5)')
    expect(bar.style.transformOrigin).toBe('left center')
    expect(bar.style.width).toBe('100%')
    expect(bar.style.transition).not.toContain('width')

    rerender(<GameStatusBanner {...base} secs={90} />)
    expect(screen.getByTestId('game-status-timer-bar').style.transform).toBe('scaleX(1)')
  })
})

describe('GameStatusBanner turn timer cues (#1464)', () => {
  const base = {
    isFinished: false,
    activeTitle: 'Your turn',
    secs: 7,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
    isYourTurn: true,
  }
  const play = playCue as jest.Mock

  beforeEach(() => play.mockClear())

  function countDown(props: Partial<Parameters<typeof GameStatusBanner>[0]>, from: number, to: number) {
    const { rerender } = render(<GameStatusBanner {...base} {...props} secs={from} />)
    for (let secs = from - 1; secs >= to; secs -= 1) rerender(<GameStatusBanner {...base} {...props} secs={secs} />)
  }

  it('ticks once a second for the last five seconds of my own turn, rising a semitone each, then sounds the expiry', () => {
    countDown({}, 7, 0)
    expect(play.mock.calls).toEqual([
      ['timer.tick', { semis: 0 }],
      ['timer.tick', { semis: 1 }],
      ['timer.tick', { semis: 2 }],
      ['timer.tick', { semis: 3 }],
      ['timer.tick', { semis: 4 }],
      ['timer.expired'],
    ])
  })

  it('stays silent on someone else’s turn, for a spectator, and with no timer', () => {
    countDown({ isYourTurn: false }, 6, 0)
    countDown({ isSpectator: true }, 6, 0)
    countDown({ showTimer: false }, 6, 0)
    countDown({ turnTimerLimit: 0 }, 6, 0)
    expect(play).not.toHaveBeenCalled()
  })

  it('does not tick when it mounts mid-countdown or the clock jumps up', () => {
    const { rerender } = render(<GameStatusBanner {...base} secs={3} />)
    rerender(<GameStatusBanner {...base} secs={60} />)
    expect(play).not.toHaveBeenCalled()
  })
})

describe('GameStatusBanner live finish (#1464)', () => {
  const base = { activeTitle: 'Your turn', secs: 30, turnTimerLimit: 60, barColor: 'var(--bd-mint)', finishedMessage: 'Done' }

  beforeEach(() => resetLiveFinish())

  it('notes a finish it watched happen, for the result overlay', () => {
    const { rerender } = render(<GameStatusBanner {...base} isFinished={false} />)
    expect(liveFinishWithin(1000)).toBeNull()
    rerender(<GameStatusBanner {...base} isFinished />)
    expect(liveFinishWithin(1000)).toBe(1)
  })

  it('notes nothing when it mounts on a game that is already over', () => {
    const { rerender } = render(<GameStatusBanner {...base} isFinished />)
    rerender(<GameStatusBanner {...base} isFinished />)
    expect(liveFinishWithin(1000)).toBeNull()
  })
})

describe('GameStatusBanner low-time warning (#1580)', () => {
  const base = {
    isFinished: false,
    activeTitle: "Alice's turn",
    secs: 30,
    turnTimerLimit: 60,
    barColor: 'var(--bd-mint)',
  }

  it('puts the warning in the timer: the clock and the bar turn low, then critical', () => {
    const { rerender } = render(<GameStatusBanner {...base} />)
    const levels = () => [
      screen.getByTestId('game-status-timer').getAttribute('data-level'),
      screen.getByTestId('game-status-timer-bar').getAttribute('data-level'),
    ]
    expect(levels()).toEqual(['normal', 'normal'])
    rerender(<GameStatusBanner {...base} secs={10} />)
    expect(levels()).toEqual(['low', 'low'])
    rerender(<GameStatusBanner {...base} secs={5} />)
    expect(levels()).toEqual(['critical', 'critical'])
    expect(screen.getByTestId('game-status-timer').textContent).toBe(':05')
  })

  it('leaves the banner box alone when the warning starts', () => {
    const { container, rerender } = render(<GameStatusBanner {...base} secs={11} />)
    const banner = container.firstElementChild as HTMLElement
    const before = { className: banner.className, style: banner.getAttribute('style'), children: banner.childElementCount }
    for (const secs of [10, 5, 1]) {
      rerender(<GameStatusBanner {...base} secs={secs} />)
      expect(container.firstElementChild).toBe(banner)
      expect({ className: banner.className, style: banner.getAttribute('style'), children: banner.childElementCount }).toEqual(before)
    }
  })

  it('colours the bar from CSS by level, so the player colour stays underneath', () => {
    render(<GameStatusBanner {...base} secs={4} />)
    const bar = screen.getByTestId('game-status-timer-bar')
    expect(bar.style.background).toBe('var(--bd-mint)')
    expect(bar.querySelectorAll('.game-status-timer-fill__layer')).toHaveLength(2)
  })
})

/**
 * jsdom applies no stylesheet, so what each level looks like is read out of
 * globals.css. Every seat colour a game passes as `barColor`:
 * Connect Four, Tic-tac-toe, Checkers, RPS, Ludo, Yahtzee, Memory, Spy, Alias.
 */
describe('GameStatusBanner low time reads apart from every seat colour (#1580)', () => {
  const SEAT_TOKENS = ['--bd-coral', '--bd-sun', '--bd-lav', '--bd-mint', '--bd-sky']
  const css = postcss.parse(readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8'))

  function unconditional(selector: string): Record<string, string> {
    const decls: Record<string, string> = {}
    css.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return
      for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
        if (node.type === 'atrule' && (node as AtRule).name !== 'layer') return
      }
      rule.walkDecls((decl) => { decls[decl.prop] = decl.value })
    })
    return decls
  }
  const paint = (decls: Record<string, string>) => [decls.background, decls['background-color'], decls['background-image']].filter(Boolean).join(' ')

  it('draws the low level as a pattern over the seat colour, not as another flat colour', () => {
    expect(paint(unconditional('.game-status-timer-fill__layer--low'))).toMatch(/repeating-linear-gradient/)
  })

  it('fills the critical level with no seat colour, so a coral or sun seat cannot look normal', () => {
    const critical = paint(unconditional('.game-status-timer-fill__layer--critical'))
    expect(critical).not.toBe('')
    for (const token of SEAT_TOKENS) expect(critical).not.toContain(token)
  })

  it('shows both levels without motion, so reduced motion keeps them', () => {
    expect(unconditional('.game-status-timer-fill[data-level="low"] > .game-status-timer-fill__layer--low').opacity).toBe('1')
    expect(unconditional('.game-status-timer-fill[data-level="critical"] > .game-status-timer-fill__layer--critical').opacity).toBe('1')
  })
})

describe('GameStatusBanner idle nudge is visible (#1343)', () => {
  const css = postcss.parse(readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8'))
  const IDLE = '.game-status-banner[data-idle="true"]::after'

  function rulesFor(selector: string) {
    const found: { decls: Record<string, string>; media: string[] }[] = []
    css.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return
      const media: string[] = []
      for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
        if (node.type === 'atrule' && (node as AtRule).name !== 'layer') media.push((node as AtRule).params)
      }
      const decls: Record<string, string> = {}
      rule.walkDecls((decl) => { decls[decl.prop] = decl.value })
      found.push({ decls, media })
    })
    return found
  }

  it('paints a ring on the banner itself, inside its box and radius', () => {
    const base = rulesFor(IDLE).find((rule) => rule.media.length === 0)
    expect(base).toBeDefined()
    expect(base!.decls.content).toBeDefined()
    expect(base!.decls['box-shadow'] ?? base!.decls.border).toMatch(/var\(--/)
    expect(base!.decls['border-radius']).toBe('inherit')
    // The banner's border is 1.5px: a larger negative inset would draw outside its box.
    expect(parseFloat(base!.decls.inset)).toBeGreaterThanOrEqual(-1.5)
    expect(rulesFor('.game-status-banner')[0]?.decls.position).toBe('relative')
  })

  it('pulses only by opacity, and only when motion is allowed', () => {
    const animated = rulesFor(IDLE).filter((rule) => rule.decls.animation)
    expect(animated.length).toBeGreaterThan(0)
    for (const rule of animated) expect(rule.media.join(' ')).toContain('prefers-reduced-motion: no-preference')
    const name = animated[0].decls.animation.split(' ')[0]
    css.walkAtRules('keyframes', (at) => {
      if (at.params !== name) return
      at.walkDecls((decl) => expect(['opacity', 'transform']).toContain(decl.prop))
    })
  })
})
