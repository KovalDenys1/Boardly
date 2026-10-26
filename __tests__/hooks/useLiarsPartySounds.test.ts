import { renderHook } from '@testing-library/react'
import { useLiarsPartySounds } from '@/app/(site)/lobby/[code]/hooks/useLiarsPartySounds'
import type { LiarsPartyGameData } from '@/lib/games/liars-party-game'
import { LIARS_BREAKDOWN_FIRST_STEP, LIARS_VERDICT_STEP, liarsRevealLastStep, staggerDelayMs } from '@/lib/social-motion'
import { REDUCED_MOTION_GAP_MS } from '@/lib/board-sounds'
import { prefersReducedMotion } from '@/lib/motion'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))
jest.mock('@/lib/motion', () => ({ prefersReducedMotion: jest.fn(() => false) }))

const play = playCue as jest.Mock

type Vote = { playerId: string; decision: 'challenge' | 'believe' }
const game = (patch: {
  round?: number
  phase?: string
  claim?: { playerId: string; isBluff?: boolean; autoSubmitted?: boolean } | null
  votes?: Vote[]
  eliminated?: string[]
  strikes?: Record<string, number>
}): LiarsPartyGameData =>
  ({
    currentRound: patch.round ?? 1,
    phase: patch.phase ?? 'claim',
    claim: patch.claim ? { text: 'I can juggle', submittedAt: 1, isBluff: false, ...patch.claim } : null,
    challengeVotes: (patch.votes ?? []).map((vote) => ({ ...vote, submittedAt: 1 })),
    eliminatedPlayerIds: patch.eliminated ?? [],
    strikes: patch.strikes ?? {},
    eliminationThreshold: 2,
    roundResults: [],
  }) as unknown as LiarsPartyGameData

function setup(initial: LiarsPartyGameData | undefined, { viewerId = 'me', isSpectator = false } = {}) {
  return renderHook((data: LiarsPartyGameData | undefined) => useLiarsPartySounds(data, { gameId: 'g1', viewerId, isSpectator }), { initialProps: initial })
}

const at = (step: number, votes: number) => staggerDelayMs(step, liarsRevealLastStep(votes))

describe('useLiarsPartySounds (#1464)', () => {
  beforeEach(() => {
    play.mockClear()
    ;(prefersReducedMotion as jest.Mock).mockReturnValue(false)
  })

  it('stays silent for the phase a reload lands in, a reveal included', () => {
    const { rerender } = setup(undefined)
    rerender(game({ phase: 'reveal', claim: { playerId: 'a', isBluff: true }, votes: [{ playerId: 'me', decision: 'challenge' }] }))
    expect(play).not.toHaveBeenCalled()
  })

  it('plays someone else’s claim and votes at the remote level, one cue each, and never my own vote', () => {
    const { rerender } = setup(game({ phase: 'claim' }))
    rerender(game({ phase: 'challenge', claim: { playerId: 'a' } }))
    rerender(game({ phase: 'challenge', claim: { playerId: 'a' }, votes: [{ playerId: 'me', decision: 'believe' }] }))
    rerender(game({ phase: 'challenge', claim: { playerId: 'a' }, votes: [{ playerId: 'me', decision: 'believe' }, { playerId: 'b', decision: 'challenge' }] }))
    expect(play.mock.calls).toEqual([['card.place', { remote: true }], ['vote.cast', { remote: true }]])
  })

  it('keeps my own claim silent on its echo: it played at the press', () => {
    const { rerender } = setup(game({ phase: 'claim' }))
    rerender(game({ phase: 'challenge', claim: { playerId: 'me' } }))
    expect(play).not.toHaveBeenCalled()
  })

  it('stamps the verdict, then says whether I called it right on my own vote row', () => {
    const votes: Vote[] = [{ playerId: 'b', decision: 'believe' }, { playerId: 'me', decision: 'challenge' }]
    const { rerender } = setup(game({ phase: 'challenge', claim: { playerId: 'a' }, votes: votes.slice(0, 1) }))
    rerender(game({ phase: 'reveal', claim: { playerId: 'a', isBluff: true }, votes }))
    expect(play.mock.calls).toEqual([
      ['verdict.stamp', { delayMs: at(LIARS_VERDICT_STEP, 2) }],
      ['round.won', { delayMs: at(LIARS_BREAKDOWN_FIRST_STEP + 1, 2) }],
    ])
  })

  it('tells a caught bluffer they lost the round, and plays player.out when an elimination lands', () => {
    const votes: Vote[] = [{ playerId: 'a', decision: 'challenge' }, { playerId: 'b', decision: 'challenge' }]
    const { rerender } = setup(game({ phase: 'challenge', claim: { playerId: 'me' }, votes: votes.slice(0, 1) }))
    rerender(game({ phase: 'reveal', claim: { playerId: 'me', isBluff: true }, votes }))
    rerender(game({ round: 2, phase: 'claim', eliminated: ['me'], strikes: { me: 2 } }))
    expect(play.mock.calls).toEqual([
      ['vote.cast', { remote: true }],
      ['verdict.stamp', { delayMs: at(LIARS_VERDICT_STEP, 2) }],
      ['round.lost', { delayMs: at(LIARS_BREAKDOWN_FIRST_STEP, 2) }],
      ['player.out', undefined],
    ])
  })

  it('hears the last round’s elimination, which arrives with the finished game, and stays silent for a player who leaves', () => {
    const votes: Vote[] = [{ playerId: 'b', decision: 'challenge' }, { playerId: 'c', decision: 'challenge' }]
    const { rerender } = setup(game({ round: 5, phase: 'reveal', claim: { playerId: 'a', isBluff: true }, votes, strikes: { a: 1 } }))
    rerender(game({ round: 5, phase: 'reveal', claim: { playerId: 'a', isBluff: true }, votes, eliminated: ['a'], strikes: { a: 2 } }))
    expect(play.mock.calls).toEqual([['player.out', undefined]])

    play.mockClear()
    const leave = setup(game({ phase: 'claim', strikes: { b: 1 } }))
    leave.rerender(game({ phase: 'claim', eliminated: ['b'], strikes: { b: 1 } }))
    expect(play).not.toHaveBeenCalled()
  })

  it('keeps the reveal in order, a short gap apart, under reduced motion', () => {
    ;(prefersReducedMotion as jest.Mock).mockReturnValue(true)
    const votes: Vote[] = [{ playerId: 'me', decision: 'believe' }]
    const { rerender } = setup(game({ phase: 'challenge', claim: { playerId: 'a' }, votes }))
    rerender(game({ phase: 'reveal', claim: { playerId: 'a', isBluff: false }, votes }))
    expect(play.mock.calls).toEqual([['verdict.stamp', { delayMs: 0 }], ['round.won', { delayMs: REDUCED_MOTION_GAP_MS }]])
  })

  it('gives a spectator the table and the verdict but no round result, and no verdict for a timed-out claim', () => {
    const { rerender } = setup(game({ phase: 'challenge', claim: { playerId: 'a' } }), { isSpectator: true })
    rerender(game({ phase: 'reveal', claim: { playerId: 'a' }, votes: [{ playerId: 'me', decision: 'believe' }] }))
    rerender(game({ round: 2, phase: 'claim' }))
    rerender(game({ round: 2, phase: 'reveal', claim: { playerId: 'b', autoSubmitted: true } }))
    expect(play.mock.calls).toEqual([
      ['vote.cast', { remote: true }],
      ['verdict.stamp', { delayMs: at(LIARS_VERDICT_STEP, 1) }],
    ])
  })
})
