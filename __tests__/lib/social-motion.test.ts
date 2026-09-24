import {
  advanceWordSwap,
  guessMatchesWord,
  initialWordSwap,
  latestEntryKey,
  onOwnAnimationEnd,
  STAGGER_MAX_STEPS,
  STAGGER_STEP_MS,
  staggerDelayMs,
  staggerStyle,
} from '@/lib/social-motion'
import { isFreshKey, FRESH_KEY_NOT_LOADED } from '@/hooks/useFreshKey'

describe('latestEntryKey', () => {
  const keyOf = (item: { id: string }) => item.id

  it('keeps the three states useFreshKey takes apart', () => {
    expect(latestEntryKey(undefined, keyOf)).toBeUndefined()
    expect(latestEntryKey(null, keyOf)).toBeNull()
    expect(latestEntryKey([], keyOf)).toBeNull()
  })

  it('reads the newest entry from the end the feed grows at', () => {
    const feed = [{ id: 'a' }, { id: 'b' }]
    expect(latestEntryKey(feed, keyOf)).toBe('b')
    expect(latestEntryKey(feed, keyOf, true)).toBe('a')
  })

  it('a feed that loads with entries does not animate its last one, but the next is fresh', () => {
    const loaded = latestEntryKey([{ id: 'a' }], keyOf)
    expect(isFreshKey(loaded, loaded ?? null, null)).toBe(false)
    const next = latestEntryKey([{ id: 'a' }, { id: 'b' }], keyOf)
    expect(isFreshKey(next, loaded ?? null, null)).toBe(true)
    expect(isFreshKey(next, FRESH_KEY_NOT_LOADED, null)).toBe(false)
  })
})

describe('staggerDelayMs', () => {
  it('steps per row and stops growing at the cap', () => {
    expect(staggerDelayMs(0)).toBe(0)
    expect(staggerDelayMs(1)).toBe(STAGGER_STEP_MS)
    expect(staggerDelayMs(3)).toBe(3 * STAGGER_STEP_MS)
    expect(staggerDelayMs(50)).toBe(STAGGER_MAX_STEPS * STAGGER_STEP_MS)
  })

  it('treats nonsense as the first row', () => {
    expect(staggerDelayMs(-2)).toBe(0)
    expect(staggerDelayMs(Number.NaN)).toBe(0)
  })

  it('renders as an inline animation delay', () => {
    expect(staggerStyle(2, 50)).toEqual({ animationDelay: '100ms' })
  })
})

describe('onOwnAnimationEnd', () => {
  it('ignores an animationend bubbling up from a child', () => {
    const callback = jest.fn()
    const handler = onOwnAnimationEnd(callback)
    const self = {} as HTMLElement
    const child = {} as HTMLElement
    handler({ target: child, currentTarget: self } as unknown as React.AnimationEvent<HTMLElement>)
    expect(callback).not.toHaveBeenCalled()
    handler({ target: self, currentTarget: self } as unknown as React.AnimationEvent<HTMLElement>)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})

describe('advanceWordSwap', () => {
  it('a guessed word leaves as correct, a skipped one as skip', () => {
    const guessed = advanceWordSwap(initialWordSwap('cat'), 'dog', 'guessed')
    expect(guessed).toEqual({ word: 'dog', leaving: { word: 'cat', exit: 'correct' }, generation: 1 })
    const skipped = advanceWordSwap(guessed, 'owl', 'skipped')
    expect(skipped).toEqual({ word: 'owl', leaving: { word: 'dog', exit: 'skip' }, generation: 2 })
  })

  it('the same word is no change, and a word with no outcome just comes in', () => {
    const state = initialWordSwap('cat')
    expect(advanceWordSwap(state, 'cat', 'guessed')).toBe(state)
    expect(advanceWordSwap(state, 'dog', undefined)).toEqual({ word: 'dog', leaving: null, generation: 1 })
    expect(advanceWordSwap(initialWordSwap(''), 'dog', 'guessed').leaving).toBeNull()
  })
})

describe('guessMatchesWord', () => {
  it('matches ignoring case and surrounding space', () => {
    expect(guessMatchesWord('  Apple ', ['banana', 'apple'])).toBe(true)
    expect(guessMatchesWord('apples', ['apple'])).toBe(false)
    expect(guessMatchesWord('', [''])).toBe(false)
  })
})
