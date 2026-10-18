import { act, renderHook } from '@testing-library/react'
import { useRpsSounds, type RpsSnapshot } from '@/app/lobby/[code]/hooks/useRpsSounds'
import { RPS_REVEAL_MS, RPS_SHAKE_MS } from '@/lib/rps-motion'
import { REDUCED_MOTION_GAP_MS } from '@/lib/board-sounds'
import { prefersReducedMotion } from '@/lib/motion'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))
jest.mock('@/lib/motion', () => ({ prefersReducedMotion: jest.fn(() => false) }))

const play = playCue as jest.Mock
const reduced = prefersReducedMotion as jest.Mock

const snap = (rounds: number, ready: string[] = [], lastWinner: string | null = null, matchOver = false): RpsSnapshot => ({ rounds, ready, lastWinner, matchOver })

function setup(initial: RpsSnapshot | null, isSeated = true) {
  return renderHook((snapshot: RpsSnapshot | null) => useRpsSounds(snapshot, { gameId: 'g1', viewerId: 'me', isSeated }), { initialProps: initial })
}

/** The cues played by now, with the fake clock's time each one played at. */
const timeline: [string, number][] = []
let startedAt = 0

describe('useRpsSounds (#1464)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    play.mockReset()
    play.mockImplementation((cue: string) => {
      timeline.push([cue, Date.now() - startedAt])
      return true
    })
    timeline.length = 0
    reduced.mockReturnValue(false)
    startedAt = Date.now()
  })
  afterEach(() => jest.useRealTimers())

  it('stays silent for the round a reload lands in, mid-reveal included', () => {
    const { rerender } = setup(null)
    rerender(snap(2, [], 'me'))
    rerender(snap(2, [], 'me'))
    act(() => jest.advanceTimersByTime(2000))
    expect(play).not.toHaveBeenCalled()
  })

  it('plays the opponent locking in at the remote level, and keeps my own optimistic lock silent', () => {
    const { rerender } = setup(snap(0))
    rerender(snap(0, ['me']))
    rerender(snap(0, ['me', 'opp']))
    expect(play.mock.calls).toEqual([['vote.cast', { remote: true }]])
  })

  it('times the reveal to the hands: shake, throw at the flip, my round result when the score changes', () => {
    const { rerender } = setup(snap(0, ['opp']))
    rerender(snap(1, [], 'opp'))
    rerender(snap(1, [], 'opp'))
    act(() => jest.advanceTimersByTime(RPS_REVEAL_MS))
    expect(timeline).toEqual([['rps.shake', 0], ['rps.throw', RPS_SHAKE_MS], ['round.lost', RPS_REVEAL_MS]])
  })

  it('says won, draw or round.end for a spectator, and stays silent for a jump of several rounds', () => {
    const seated = setup(snap(0))
    seated.rerender(snap(1, [], 'me'))
    act(() => jest.advanceTimersByTime(RPS_REVEAL_MS))
    seated.rerender(snap(2, [], 'draw'))
    act(() => jest.advanceTimersByTime(RPS_REVEAL_MS))
    const watcher = setup(snap(0), false)
    watcher.rerender(snap(1, [], 'me'))
    act(() => jest.advanceTimersByTime(RPS_REVEAL_MS))
    watcher.rerender(snap(4, [], 'opp'))
    act(() => jest.advanceTimersByTime(RPS_REVEAL_MS))
    expect(timeline.map(([cue]) => cue).filter((cue) => cue.startsWith('round.'))).toEqual(['round.won', 'round.draw', 'round.end'])
  })

  it('leaves the match-final round’s verdict to the result overlay, so no round cue lands after it', () => {
    reduced.mockReturnValue(true)
    const { rerender } = setup(snap(2, [], 'opp'))
    rerender(snap(3, [], 'me', true))
    act(() => jest.advanceTimersByTime(RPS_REVEAL_MS))
    expect(timeline).toEqual([['rps.shake', 0], ['rps.throw', REDUCED_MOTION_GAP_MS]])
  })

  it('keeps every cue under reduced motion, a short gap apart, and cancels the run on unmount', () => {
    reduced.mockReturnValue(true)
    const { rerender, unmount } = setup(snap(0))
    rerender(snap(1, [], 'opp'))
    act(() => jest.advanceTimersByTime(2 * REDUCED_MOTION_GAP_MS))
    expect(timeline).toEqual([['rps.shake', 0], ['rps.throw', REDUCED_MOTION_GAP_MS], ['round.lost', 2 * REDUCED_MOTION_GAP_MS]])

    reduced.mockReturnValue(false)
    rerender(snap(2, [], 'me'))
    unmount()
    act(() => jest.advanceTimersByTime(RPS_REVEAL_MS))
    expect(timeline.map(([cue]) => cue)).toEqual(['rps.shake', 'rps.throw', 'round.lost', 'rps.shake'])
  })
})
