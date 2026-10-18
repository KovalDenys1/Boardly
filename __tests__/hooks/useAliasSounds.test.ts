import { renderHook } from '@testing-library/react'
import { useAliasSounds, type UseAliasSoundsOptions } from '@/app/lobby/[code]/hooks/useAliasSounds'
import type { AliasGameData } from '@/lib/games/alias'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const play = playCue as jest.Mock

type Word = 'guessed' | 'skipped'
const data = (patch: { phase?: AliasGameData['phase']; words?: Word[]; turn?: number; describer?: string }): AliasGameData => {
  const phase = patch.phase ?? 'turn_active'
  const results = (patch.words ?? []).map((result, i) => ({ word: `w${i}`, result }))
  return {
    phase,
    currentTeamIndex: 0,
    teams: [
      { id: 't1', name: 'Team 1', score: 0, playerIds: ['desc', 'me'], describerIndex: phase === 'turn_results' ? 1 : 0 },
      { id: 't2', name: 'Team 2', score: 0, playerIds: ['x', 'y'], describerIndex: 0 },
    ],
    turnStartedAt: patch.turn ?? 1000,
    currentCardResults: phase === 'turn_active' ? results : [],
    lastTurnResult: phase === 'turn_results' ? { teamId: 't1', describerId: patch.describer ?? 'desc', wordResults: results, scoreDelta: 0, turnIndex: 0 } : null,
  } as unknown as AliasGameData
}

const base: UseAliasSoundsOptions = { data: data({}), lastMoveAt: 0, game: { id: 'g1', status: 'playing' }, outcome: undefined, viewerId: 'me', isSpectator: false, remaining: 40 }
/** A move the server applied: it stamps state.lastMoveAt. */
const moved = (n: number) => ({ lastMoveAt: n })

function setup(initial: UseAliasSoundsOptions) {
  return renderHook((props: UseAliasSoundsOptions) => useAliasSounds(props), { initialProps: initial })
}

describe('useAliasSounds (#1464)', () => {
  beforeEach(() => play.mockClear())

  it('stays silent for the turn a reload lands in, and for a game that was already over', () => {
    setup({ ...base, data: data({ words: ['guessed', 'skipped'] }) })
    setup({ ...base, data: undefined, game: { id: 'g1', status: 'finished' }, outcome: 'win' })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays each word the describer settles at the remote level, by its result', () => {
    const { rerender } = setup(base)
    rerender({ ...base, ...moved(1), data: data({ words: ['guessed'] }) })
    rerender({ ...base, ...moved(2), data: data({ words: ['guessed', 'skipped'] }) })
    rerender({ ...base, ...moved(2), data: data({ words: ['guessed', 'skipped'] }) })
    expect(play.mock.calls).toEqual([['card.correct', { remote: true }], ['card.skip', { remote: true }]])
  })

  it('keeps the describer’s own words silent on the echo (they play once the server accepts them), then plays round.end once', () => {
    const { rerender } = setup({ ...base, viewerId: 'desc' })
    rerender({ ...base, ...moved(1), viewerId: 'desc', data: data({ words: ['guessed'] }) })
    rerender({ ...base, ...moved(2), viewerId: 'desc', data: data({ phase: 'turn_results', words: ['guessed', 'guessed'] }) })
    rerender({ ...base, ...moved(2), viewerId: 'desc', data: data({ phase: 'turn_results', words: ['guessed', 'guessed'] }) })
    expect(play.mock.calls).toEqual([['round.end', { delayMs: 150 }]])
  })

  it('plays the last word of a turn that ended with it, then round.end', () => {
    const { rerender } = setup({ ...base, ...moved(1), data: data({ words: ['guessed'] }) })
    rerender({ ...base, ...moved(2), data: data({ phase: 'turn_results', words: ['guessed', 'guessed'] }) })
    expect(play.mock.calls).toEqual([['card.correct', { remote: true }], ['round.end', { delayMs: 150 }]])
  })

  it.each([1, 2, 3])('plays only round.end for a timeout that skips the last %i word(s): the fallback is not a move', (skipped) => {
    const { rerender } = setup({ ...base, ...moved(1), data: data({ words: ['guessed'] }) })
    rerender({ ...base, ...moved(1), data: data({ phase: 'turn_results', words: ['guessed', ...Array<'skipped'>(skipped).fill('skipped')] }) })
    expect(play.mock.calls).toEqual([['round.end', { delayMs: 150 }]])
  })

  it('hears a new turn whose start and first word arrive together, and a turn that goes straight to its results', () => {
    const merged = setup({ ...base, ...moved(1), data: data({ phase: 'turn_results', words: ['guessed'], turn: 1000 }) })
    merged.rerender({ ...base, ...moved(2), data: data({ words: ['skipped'], turn: 2000 }) })
    merged.rerender({ ...base, ...moved(3), data: data({ phase: 'turn_results', words: ['skipped', 'guessed'], turn: 3000 }) })
    expect(play.mock.calls).toEqual([['card.skip', { remote: true }], ['card.correct', { remote: true }], ['round.end', { delayMs: 150 }]])
  })

  it('ticks the last seconds for the team on the clock only', () => {
    const mine = setup({ ...base, remaining: 6 })
    mine.rerender({ ...base, remaining: 5 })
    mine.rerender({ ...base, remaining: 0 })
    expect(play.mock.calls).toEqual([['timer.tick', { semis: 0 }], ['timer.expired']])

    play.mockClear()
    const other = setup({ ...base, viewerId: 'x', remaining: 6 })
    other.rerender({ ...base, viewerId: 'x', remaining: 5 })
    expect(play).not.toHaveBeenCalled()
  })

  it('plays my result once when the server says the game is over, and result.over for a spectator', () => {
    const { rerender } = setup(base)
    rerender({ ...base, data: undefined, game: { id: 'g1', status: 'finished' }, outcome: 'loss' })
    rerender({ ...base, data: undefined, game: { id: 'g1', status: 'finished' }, outcome: 'loss' })
    expect(play.mock.calls).toEqual([['result.loss', { gameId: 'g1' }]])

    play.mockClear()
    const watcher = setup({ ...base, isSpectator: true })
    watcher.rerender({ ...base, isSpectator: true, data: undefined, game: { id: 'g1', status: 'finished' } })
    expect(play.mock.calls).toEqual([['result.over', { gameId: 'g1' }]])
  })
})
