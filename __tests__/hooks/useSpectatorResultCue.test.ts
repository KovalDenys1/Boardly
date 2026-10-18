import { renderHook } from '@testing-library/react'
import { useSpectatorResultCue, type UseSpectatorResultCueOptions } from '@/hooks/useSpectatorResultCue'
import { playCue } from '@/lib/sound-engine'
import { prefersReducedMotion } from '@/lib/motion'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))
jest.mock('@/lib/motion', () => ({ prefersReducedMotion: jest.fn(() => false) }))

const play = playCue as jest.Mock
const reducedMotion = prefersReducedMotion as jest.Mock

function setup(initial: UseSpectatorResultCueOptions) {
  return renderHook((props: UseSpectatorResultCueOptions) => useSpectatorResultCue(props), { initialProps: initial })
}

const watching = { isSpectator: true, gameId: 'g1', revealDelayMs: 1200 }

describe('useSpectatorResultCue (#1464)', () => {
  beforeEach(() => {
    play.mockClear()
    reducedMotion.mockReturnValue(false)
  })

  it('plays result.over once, at the reveal delay, when the game finishes while the spectator watches', () => {
    const { rerender } = setup({ ...watching, isFinished: false })
    rerender({ ...watching, isFinished: true })
    rerender({ ...watching, isFinished: true })
    expect(play.mock.calls).toEqual([['result.over', { gameId: 'g1#end', delayMs: 1200 }]])
  })

  it('stays silent for a game that is already finished when it first loads', () => {
    const { rerender } = setup({ ...watching, gameId: null, isFinished: false })
    rerender({ ...watching, isFinished: true })
    rerender({ ...watching, isFinished: true })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays nothing for a seated player, whose result is the overlay’s', () => {
    const { rerender } = setup({ ...watching, isSpectator: false, isFinished: false })
    rerender({ ...watching, isSpectator: false, isFinished: true })
    expect(play).not.toHaveBeenCalled()
  })

  it('counts a new game id as a new first load, and hears that game’s own live finish', () => {
    const { rerender } = setup({ ...watching, isFinished: true })
    rerender({ ...watching, gameId: 'g2', isFinished: true })
    expect(play).not.toHaveBeenCalled()
    rerender({ ...watching, gameId: 'g3', isFinished: false })
    rerender({ ...watching, gameId: 'g3', isFinished: true })
    expect(play.mock.calls).toEqual([['result.over', { gameId: 'g3#end', delayMs: 1200 }]])
  })

  it('keys each round of a series by its round in state', () => {
    const { rerender } = setup({ ...watching, isFinished: false, finishKey: 0 })
    rerender({ ...watching, isFinished: true, finishKey: 1 })
    rerender({ ...watching, isFinished: false, finishKey: 1 })
    rerender({ ...watching, isFinished: true, finishKey: 2 })
    expect(play.mock.calls).toEqual([
      ['result.over', { gameId: 'g1#1', delayMs: 1200 }],
      ['result.over', { gameId: 'g1#2', delayMs: 1200 }],
    ])
  })

  it('hears round 2 after a remount under a key the engine has not spent on round 1', () => {
    const first = setup({ ...watching, isFinished: false, finishKey: 0 })
    first.rerender({ ...watching, isFinished: true, finishKey: 1 })
    first.unmount()

    const second = setup({ ...watching, isFinished: false, finishKey: 1 })
    second.rerender({ ...watching, isFinished: true, finishKey: 2 })
    expect(play.mock.calls).toEqual([
      ['result.over', { gameId: 'g1#1', delayMs: 1200 }],
      ['result.over', { gameId: 'g1#2', delayMs: 1200 }],
    ])
  })

  it('does not wait under reduced motion, where the overlay reveals at once', () => {
    reducedMotion.mockReturnValue(true)
    const { rerender } = setup({ ...watching, isFinished: false })
    rerender({ ...watching, isFinished: true })
    expect(play.mock.calls).toEqual([['result.over', { gameId: 'g1#end', delayMs: 0 }]])
  })
})
