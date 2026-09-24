import {
  advanceWordSwap,
  guessMatchesWord,
  initialWordSwap,
  latestEntryKey,
  isFreshId,
  onOwnAnimationEnd,
  spyTurnPassKey,
  STAGGER_MAX_TOTAL_MS,
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
  it('spaces a short reveal at the full step', () => {
    expect(staggerDelayMs(0, 5)).toBe(0)
    expect(staggerDelayMs(1, 5)).toBe(STAGGER_STEP_MS)
    expect(staggerDelayMs(5, 5)).toBe(5 * STAGGER_STEP_MS)
  })

  it('compresses a long reveal to fit instead of clamping, so every step stays in order', () => {
    // A 20-word Alias turn: words 0..19, the turn score at 20, the team total at 23.
    const last = 23
    const delays = Array.from({ length: last + 1 }, (_, step) => staggerDelayMs(step, last))
    for (let step = 1; step <= last; step++) expect(delays[step]).toBeGreaterThan(delays[step - 1])
    expect(delays[last]).toBeLessThanOrEqual(STAGGER_MAX_TOTAL_MS)
    // The last word, the stamp and the total no longer start together.
    expect(new Set([delays[19], delays[20], delays[23]]).size).toBe(3)
  })

  it('treats nonsense as the first step', () => {
    expect(staggerDelayMs(-2, 5)).toBe(0)
    expect(staggerDelayMs(Number.NaN, 5)).toBe(0)
  })

  it('renders as an inline animation delay', () => {
    expect(staggerStyle(2, 4, 50)).toEqual({ animationDelay: '100ms' })
  })
})

describe('isFreshId', () => {
  it('only ids that joined after the list loaded, until settled', () => {
    const baseline = new Set(['1'])
    expect(isFreshId('1', baseline, new Set())).toBe(false)
    expect(isFreshId('2', baseline, new Set())).toBe(true)
    expect(isFreshId('2', baseline, new Set(['2']))).toBe(false)
    expect(isFreshId('2', null, new Set())).toBe(false)
  })
})

describe('spyTurnPassKey', () => {
  it('changes when the turn passes, including back to the same questioner', () => {
    const a1 = spyTurnPassKey(true, 1, 0, 'a')
    const b = spyTurnPassKey(true, 1, 1, 'b')
    const a2 = spyTurnPassKey(true, 1, 2, 'a')
    expect(new Set([a1, b, a2]).size).toBe(3)
    // A skip passes the turn without a new entry.
    expect(spyTurnPassKey(true, 1, 1, 'c')).not.toBe(b)
  })

  it('is null outside questioning or without a questioner', () => {
    expect(spyTurnPassKey(false, 1, 0, 'a')).toBeNull()
    expect(spyTurnPassKey(true, 1, 0, null)).toBeNull()
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
