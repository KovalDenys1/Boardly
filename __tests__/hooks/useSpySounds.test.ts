import { renderHook } from '@testing-library/react'
import { ROLE_FLIP_DELAY_MS, useSpySounds, type SpySnapshot } from '@/app/lobby/[code]/hooks/useSpySounds'
import { SpyGamePhase } from '@/lib/games/spy-game'
import { REDUCED_MOTION_GAP_MS } from '@/lib/board-sounds'
import { prefersReducedMotion } from '@/lib/motion'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))
jest.mock('@/lib/motion', () => ({ prefersReducedMotion: jest.fn(() => false) }))

const play = playCue as jest.Mock

const base: SpySnapshot = {
  phase: SpyGamePhase.QUESTIONING,
  round: 1,
  roleCard: false,
  questioner: 'a',
  asked: null,
  entries: 0,
  answeredBy: null,
  voters: [],
  outAtMs: null,
}
const at = (patch: Partial<SpySnapshot>): SpySnapshot => ({ ...base, ...patch })

function setup(initial: SpySnapshot | null, { viewerId = 'me', isSpectator = false, phaseStartedAt = 0 } = {}) {
  return renderHook((snapshot: SpySnapshot | null) => useSpySounds(snapshot, { gameId: 'g1', viewerId, isSpectator, phaseStartedAt }), { initialProps: initial })
}

describe('useSpySounds (#1464)', () => {
  beforeEach(() => {
    play.mockClear()
    ;(prefersReducedMotion as jest.Mock).mockReturnValue(false)
  })

  it('stays silent for the state a reload lands in, mid-question or mid-vote', () => {
    setup(at({ questioner: 'me', entries: 3 }))
    setup(at({ phase: SpyGamePhase.VOTING, voters: ['a', 'b'] }))
    setup(at({ phase: SpyGamePhase.ROLE_REVEAL, roleCard: true }), { phaseStartedAt: Date.now() - 60_000 })
    expect(play).not.toHaveBeenCalled()
  })

  it('deals and flips my role card for a round 1 reveal that arrives with the board, even when the card loads later', () => {
    const { rerender } = setup(at({ phase: SpyGamePhase.ROLE_REVEAL }), { phaseStartedAt: Date.now() })
    rerender(at({ phase: SpyGamePhase.ROLE_REVEAL, roleCard: true }))
    expect(play.mock.calls).toEqual([['card.deal', undefined], ['card.flip', { delayMs: ROLE_FLIP_DELAY_MS }]])
  })

  it('never deals to a spectator who opens the page on a reveal that has just begun', () => {
    setup(at({ phase: SpyGamePhase.ROLE_REVEAL }), { isSpectator: true, phaseStartedAt: Date.now() })
    expect(play).not.toHaveBeenCalled()
  })

  it('keeps the results in order, a short gap apart, under reduced motion', () => {
    ;(prefersReducedMotion as jest.Mock).mockReturnValue(true)
    const { rerender } = setup(at({ phase: SpyGamePhase.VOTING }))
    rerender(at({ phase: SpyGamePhase.RESULTS, outAtMs: 140 }))
    expect(play.mock.calls).toEqual([['verdict.stamp', { delayMs: 0 }], ['player.out', { delayMs: REDUCED_MOTION_GAP_MS }]])
  })

  it('deals a later round once when its reveal starts', () => {
    const { rerender } = setup(at({ phase: SpyGamePhase.RESULTS }))
    rerender(at({ phase: SpyGamePhase.ROLE_REVEAL, round: 2, roleCard: true }))
    rerender(at({ phase: SpyGamePhase.ROLE_REVEAL, round: 2, roleCard: true }))
    expect(play.mock.calls).toEqual([['card.deal', undefined], ['card.flip', { delayMs: ROLE_FLIP_DELAY_MS }]])
  })

  it('plays someone else’s answered question as a remote card, and my own answer not at all (it played at the press)', () => {
    const { rerender } = setup(at({ questioner: 'a', asked: 'b' }))
    rerender(at({ questioner: 'b', entries: 1, answeredBy: 'b' }))
    expect(play.mock.calls).toEqual([['card.place', { remote: true }]])

    play.mockClear()
    const mine = setup(at({ questioner: 'a', asked: 'me' }))
    mine.rerender(at({ questioner: 'c', entries: 1, answeredBy: 'me' }))
    expect(play).not.toHaveBeenCalled()
  })

  it('plays turn.mine when the questioner seat comes to me after the answer lands, and when I am asked', () => {
    const { rerender } = setup(at({ questioner: 'a', asked: 'b' }))
    rerender(at({ questioner: 'me', entries: 1, answeredBy: 'b' }))
    expect(play.mock.calls).toEqual([['card.place', { remote: true }], ['turn.mine', { delayMs: 150 }]])

    play.mockClear()
    const asked = setup(at({ questioner: 'a' }))
    asked.rerender(at({ questioner: 'a', asked: 'me' }))
    asked.rerender(at({ questioner: 'a', asked: 'me' }))
    expect(play.mock.calls).toEqual([['turn.mine', undefined]])
  })

  it('plays one remote vote per arriving batch, never my own vote, and the stamp then who is out at the results', () => {
    const { rerender } = setup(at({ phase: SpyGamePhase.VOTING }))
    rerender(at({ phase: SpyGamePhase.VOTING, voters: ['me'] }))
    rerender(at({ phase: SpyGamePhase.VOTING, voters: ['a', 'b', 'me'] }))
    rerender(at({ phase: SpyGamePhase.RESULTS, voters: ['a', 'b', 'c', 'me'], outAtMs: 140 }))
    expect(play.mock.calls).toEqual([
      ['vote.cast', { remote: true }],
      ['verdict.stamp', undefined],
      ['player.out', { delayMs: 140 }],
    ])
  })

  it('gives a spectator the table’s moves and the results, but no turn cues', () => {
    const { rerender } = setup(at({ questioner: 'a', asked: 'me' }), { viewerId: 'me', isSpectator: true })
    rerender(at({ questioner: 'me', entries: 1, answeredBy: 'me' }))
    rerender(at({ phase: SpyGamePhase.RESULTS, entries: 1, answeredBy: 'me' }))
    expect(play.mock.calls).toEqual([['card.place', { remote: true }], ['verdict.stamp', undefined]])
  })
})
