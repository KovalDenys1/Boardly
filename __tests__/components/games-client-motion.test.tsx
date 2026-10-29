import { act, fireEvent, render, screen, within } from '@testing-library/react'
import GamesClient from '@/app/(site)/games/GamesClient'
import { getCatalogGames } from '@/lib/game-catalog'
import { DEFAULT_GAMES_FILTERS, filterGames, type GamesFilters } from '@/lib/games-filter'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('@/components/Footer', () => () => null)
jest.mock('@/components/GuidesSection', () => () => null)

// Filters live in the URL: the mock follows window.location and hears every pushState.
jest.mock('next/navigation', () => {
  const actual = jest.requireActual('next/navigation')
  const { useSyncExternalStore } = jest.requireActual('react')
  const subscribe = (onChange: () => void) => {
    window.addEventListener('test-navigate', onChange)
    return () => window.removeEventListener('test-navigate', onChange)
  }
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search, () => '')),
  }
})

class FakeAnimation {
  playState: 'running' | 'finished' | 'idle' = 'running'
  onfinish: (() => void) | null = null
  oncancel: (() => void) | null = null
  finished: Promise<FakeAnimation>
  private listeners: Record<'finish' | 'cancel', Array<() => void>> = { finish: [], cancel: [] }
  private settle!: { resolve: (value: FakeAnimation) => void; reject: (reason: unknown) => void }

  constructor() {
    this.finished = new Promise((resolve, reject) => { this.settle = { resolve, reject } })
    this.finished.catch(() => {})
  }

  addEventListener(type: 'finish' | 'cancel', listener: () => void) { this.listeners[type].push(listener) }
  removeEventListener(type: 'finish' | 'cancel', listener: () => void) {
    this.listeners[type] = this.listeners[type].filter((candidate) => candidate !== listener)
  }

  finish() {
    if (this.playState !== 'running') return
    this.playState = 'finished'
    this.onfinish?.()
    this.listeners.finish.forEach((listener) => listener())
    this.settle.resolve(this)
  }

  cancel() {
    if (this.playState !== 'running') return
    this.playState = 'idle'
    this.oncancel?.()
    this.listeners.cancel.forEach((listener) => listener())
    this.settle.reject(new Error('AbortError'))
  }
}

type AnimateCall = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: FakeAnimation }

const games = getCatalogGames()
const namesFor = (patch: Partial<GamesFilters>) =>
  filterGames(games, { ...DEFAULT_GAMES_FILTERS, ...patch }).map((game) => game.nameKey).sort()
const visibleNames = () => screen.queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent ?? '').sort()
const chip = (label: string) => screen.getByRole('button', { name: label })

let calls: AnimateCall[] = []
let reduceMotion = false
const realPushState = window.history.pushState.bind(window.history)
const realMatchMedia = window.matchMedia
const realRect = HTMLElement.prototype.getBoundingClientRect

async function finishAll() {
  await act(async () => {
    calls.forEach((call) => call.animation.finish())
    await Promise.resolve()
  })
}

beforeEach(() => {
  calls = []
  reduceMotion = false
  window.history.replaceState(null, '', '/games')
  jest.spyOn(window.history, 'pushState').mockImplementation((...args: Parameters<History['pushState']>) => {
    realPushState(...args)
    window.dispatchEvent(new Event('test-navigate'))
  })
  window.matchMedia = jest.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia
  // A three-column grid: each element sits where its index among its siblings puts it.
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    const index = this.parentElement ? Array.prototype.indexOf.call(this.parentElement.children, this) : 0
    const left = (index % 3) * 320
    const top = Math.floor(index / 3) * 300
    return { left, top, right: left + 300, bottom: top + 280, width: 300, height: 280, x: left, y: top, toJSON: () => ({}) } as DOMRect
  }
  ;(Element.prototype as unknown as { animate: unknown }).animate = function animate(
    this: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation = new FakeAnimation()
    calls.push({ el: this, keyframes, options, animation })
    return animation
  }
})

afterEach(() => {
  jest.restoreAllMocks()
  window.matchMedia = realMatchMedia
  HTMLElement.prototype.getBoundingClientRect = realRect
  delete (Element.prototype as unknown as { animate?: unknown }).animate
})

describe('GamesClient filter motion (#1581)', () => {
  it('shows exactly the games the filter keeps, at once, when motion is reduced', () => {
    reduceMotion = true
    render(<GamesClient games={games} />)

    fireEvent.click(chip('games.comingSoon'))

    expect(visibleNames()).toEqual(namesFor({ status: 'coming-soon' }))
    expect(screen.queryAllByText('games.yahtzee.name')).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('fades a leaving card out where it stood, hidden from the page, then removes it', async () => {
    render(<GamesClient games={games} />)

    fireEvent.click(chip('games.comingSoon'))

    expect(screen.queryByRole('heading', { name: 'games.yahtzee.name' })).toBeNull()
    const leaving = screen.getAllByText('games.yahtzee.name')
    expect(leaving).toHaveLength(1)
    expect(leaving[0].closest('[aria-hidden="true"]')).not.toBeNull()
    const exit = calls.find((call) => call.el.contains(leaving[0]))
    expect(exit?.keyframes.at(-1)).toMatchObject({ opacity: 0 })

    await finishAll()
    expect(screen.queryAllByText('games.yahtzee.name')).toHaveLength(0)
    expect(visibleNames()).toEqual(namesFor({ status: 'coming-soon' }))
  })

  it('moves the cards that stay and fades the new ones in, by transform and opacity only, within 300 ms', async () => {
    render(<GamesClient games={games} />)
    fireEvent.click(chip('games.comingSoon'))
    await finishAll()
    calls = []

    fireEvent.click(chip('common.all'))

    const stayed = namesFor({ status: 'coming-soon' })
    const cardOf = (call: AnimateCall) => within(call.el as HTMLElement).queryByRole('heading', { level: 3 })?.textContent ?? ''
    const moves = calls.filter((call) => stayed.includes(cardOf(call)) && call.keyframes.some((frame) => 'transform' in frame))
    const enters = calls.filter((call) => cardOf(call) === 'games.yahtzee.name')

    expect(moves.length).toBeGreaterThan(0)
    expect(moves[0].keyframes[0].transform).toMatch(/translate/)
    expect(moves[0].keyframes.at(-1)).toMatchObject({ transform: 'none' })
    expect(enters).toHaveLength(1)
    expect(enters[0].keyframes[0]).toMatchObject({ opacity: 0 })
    expect(enters[0].keyframes.at(-1)).toMatchObject({ opacity: 1 })
    for (const call of calls) {
      for (const frame of call.keyframes) {
        expect(Object.keys(frame).filter((key) => !['transform', 'opacity', 'offset', 'easing'].includes(key))).toEqual([])
      }
      expect(Number(call.options.duration) + (call.options.delay ?? 0)).toBeLessThanOrEqual(300)
    }
    expect(visibleNames()).toEqual(namesFor({}))
  })

  it('leaves every card whole once quick successive changes settle', async () => {
    render(<GamesClient games={games} />)

    fireEvent.click(chip('games.comingSoon'))
    fireEvent.click(chip('common.all'))
    fireEvent.click(chip('games.available'))
    await finishAll()

    expect(visibleNames()).toEqual(namesFor({ status: 'available' }))
    expect(document.querySelectorAll('[aria-hidden="true"] h3')).toHaveLength(0)
    for (const heading of screen.getAllByRole('heading', { level: 3 })) {
      const card = heading.closest('a, [data-game-card]') as HTMLElement
      expect(card.style.opacity).toBe('')
      expect(card.style.transform).toBe('')
    }
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => call.options.fill !== 'forwards' && call.options.fill !== 'both')).toBe(true)
  })
})
