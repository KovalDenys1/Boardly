import { renderHook } from '@testing-library/react'
import { motionCues, useLiveCues, type CuePlay } from '@/hooks/useLiveCues'
import { REDUCED_MOTION_GAP_MS } from '@/lib/board-sounds'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

type Snap = { moves: number } | null | undefined

function setup(initial: Snap) {
  const cuesFor = jest.fn((prev: { moves: number }, next: { moves: number }): CuePlay[] =>
    next.moves > prev.moves ? [{ cue: 'ui.select', options: { remote: true } }] : [],
  )
  const hook = renderHook((snapshot: Snap) => useLiveCues(snapshot, cuesFor), { initialProps: initial })
  return { ...hook, cuesFor }
}

describe('useLiveCues (#1464)', () => {
  beforeEach(() => play.mockClear())

  it('never reports the snapshot a page loads into, then plays each change once', () => {
    const { rerender, cuesFor } = setup(undefined)
    rerender({ moves: 4 })
    rerender({ moves: 4 })
    expect(cuesFor).not.toHaveBeenCalled()
    rerender({ moves: 5 })
    rerender({ moves: 5 })
    expect(play.mock.calls).toEqual([['ui.select', { remote: true }]])
  })

  it('compares by value, so a new object with the same content is not a change', () => {
    const { rerender, cuesFor } = setup({ moves: 1 })
    rerender({ moves: 1 })
    expect(cuesFor).not.toHaveBeenCalled()
  })

  it('plays what loadCues asks for on the first snapshot only', () => {
    const loadCues = jest.fn((): CuePlay[] => [{ cue: 'card.deal' }])
    const { rerender } = renderHook((snapshot: Snap) => useLiveCues(snapshot, () => [], { loadCues }), { initialProps: { moves: 0 } as Snap })
    rerender({ moves: 1 })
    expect(loadCues).toHaveBeenCalledTimes(1)
    expect(play.mock.calls).toEqual([['card.deal', undefined]])
  })

  it('drops the last snapshot and empties the scoped memory when the game changes', () => {
    const heard = new Set(['1:me'])
    const cuesFor = jest.fn((): CuePlay[] => [{ cue: 'ui.select' }])
    const { rerender } = renderHook(({ snapshot, scope }: { snapshot: Snap; scope: string }) => useLiveCues(snapshot, cuesFor, { scope, scoped: [heard] }), {
      initialProps: { snapshot: { moves: 3 }, scope: 'g1' },
    })
    rerender({ snapshot: { moves: 0 }, scope: 'g2' })
    expect(cuesFor).not.toHaveBeenCalled()
    expect(heard.size).toBe(0)
    rerender({ snapshot: { moves: 1 }, scope: 'g2' })
    expect(cuesFor).toHaveBeenCalledTimes(1)
  })

  it('spaces one change’s cues REDUCED_MOTION_GAP_MS apart in their order under reduced motion, and leaves them alone otherwise', () => {
    const cues: CuePlay[] = [{ cue: 'card.flip', options: { remote: true } }, { cue: 'card.collect', options: { remote: true, delayMs: 400 } }]
    expect(motionCues(cues, false)).toBe(cues)
    expect(motionCues(cues, true)).toEqual([
      { cue: 'card.flip', options: { remote: true, delayMs: 0 } },
      { cue: 'card.collect', options: { remote: true, delayMs: REDUCED_MOTION_GAP_MS } },
    ])
  })

  it('forgets the last snapshot on null, so the next one is a load again', () => {
    const { rerender } = setup({ moves: 1 })
    rerender(null)
    rerender({ moves: 9 })
    expect(play).not.toHaveBeenCalled()
  })
})
