import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplaySnapshotInput } from '@/lib/replay/types'

let n = 0
const snap = (actionType: string, playerId: string | null, state: unknown, payload: unknown = null): ReplaySnapshotInput => ({
  id: `s${n++}`,
  turnNumber: n,
  playerId,
  actionType,
  actionPayload: payload,
  state,
  createdAt: `2026-10-13T10:00:${String(n).padStart(2, '0')}.000Z`,
})
const playing = (data: Record<string, unknown> = {}) => ({ status: 'playing', data })

beforeEach(() => {
  n = 0
})

describe('groupSteps', () => {
  it('keeps game:start as step 0, marks timeouts as system steps and strips the bot prefix', () => {
    const steps = groupSteps('tic_tac_toe', [
      snap('game:start', null, playing()),
      snap('place', 'a', playing()),
      snap('bot:place', 'b', playing()),
      snap('tic_tac_toe:timeout-fallback', null, playing()),
    ])

    expect(steps.map((s) => [s.index, s.action, s.kind, s.isBot])).toEqual([
      [0, 'game:start', 'start', false],
      [1, 'place', 'move', false],
      [2, 'place', 'move', true],
      [3, 'tic_tac_toe:timeout-fallback', 'system', false],
    ])
    expect(steps[1].prevState).toBe(steps[0].state)
  })

  it('drops a snapshot whose state failed to decode', () => {
    const steps = groupSteps('connect_four', [snap('game:start', null, playing()), snap('drop', 'a', null), snap('drop', 'b', playing())])

    expect(steps).toHaveLength(2)
    expect(steps[1].snapshotIds).toEqual(['s2'])
  })

  it('merges Checkers chain hops by one actor into a single jump', () => {
    const hop1 = playing({ chainFrom: [3, 2] })
    const hop2 = playing({ chainFrom: [5, 4] })
    const done = playing({ chainFrom: null })
    const steps = groupSteps('checkers', [
      snap('game:start', null, playing({ chainFrom: null })),
      snap('step', 'a', hop1),
      snap('step', 'a', hop2),
      snap('step', 'a', done),
      snap('bot:step', 'b', playing({ chainFrom: null })),
    ])

    expect(steps).toHaveLength(3)
    expect(steps[1].snapshotIds).toEqual(['s1', 's2', 's3'])
    expect(steps[1].state).toBe(done)
    expect(steps[2].prevState).toBe(done)
  })

  it('folds a Memory mismatch resolution into the flip that caused it', () => {
    const bothUp = playing({ flipped: 2 })
    const backDown = playing({ flipped: 0 })
    const steps = groupSteps('memory', [
      snap('game:start', null, playing()),
      snap('flip', 'a', playing({ flipped: 1 })),
      snap('flip', 'a', bothUp),
      snap('resolve-mismatch', null, backDown),
      snap('bot:flip', 'b', playing({ flipped: 1 })),
    ])

    expect(steps).toHaveLength(4)
    expect(steps[2].state).toBe(bothUp)
    expect(steps[2].endState).toBe(backDown)
    expect(steps[3].prevState).toBe(backDown)
  })

  it('gives a Memory timeout its own step unless it turns back a card the flip left up', () => {
    const oneUp = playing({ flippedCardIds: ['c1'], pendingMismatchCardIds: [] })
    const hidden = playing({ flippedCardIds: [], pendingMismatchCardIds: [] })
    const steps = groupSteps('memory', [
      snap('game:start', null, playing()),
      snap('flip', 'a', playing({ flippedCardIds: ['c1', 'c2'], pendingMismatchCardIds: ['c1', 'c2'] })),
      snap('resolve-mismatch', 'a', hidden),
      snap('timeout-pass', 'b', hidden),
      snap('flip', 'a', playing({ flippedCardIds: [], pendingMismatchCardIds: [] })),
      snap('timeout-pass', 'a', hidden),
      snap('flip', 'b', oneUp),
      snap('timeout-pass', 'b', hidden),
    ])

    expect(steps.map((s) => s.action)).toEqual(['game:start', 'flip', 'timeout-pass', 'flip', 'timeout-pass', 'flip'])
    expect(steps[1].endState).toBe(hidden)
    expect(steps[5].endState).toBe(hidden)
    expect(steps[2].kind).toBe('system')
  })

  it('makes one step of the two choices of a Rock Paper Scissors round', () => {
    const resolved = playing({ rounds: [{ winner: 'a' }] })
    const steps = groupSteps('rock_paper_scissors', [
      snap('game:start', null, playing()),
      snap('submit-choice', 'a', playing()),
      snap('bot:submit-choice', 'b', resolved),
      snap('submit-choice', 'a', playing()),
    ])

    expect(steps.map((s) => s.snapshotIds)).toEqual([['s0'], ['s1', 's2'], ['s3']])
    expect(steps[1].state).toBe(resolved)
  })

  it('folds Spy player-ready into the round start and Sketch & Guess timeout saves into the submit', () => {
    const spy = groupSteps('guess_the_spy', [
      snap('spy:init-round', null, playing()),
      snap('spy:player-ready', 'a', playing()),
      snap('spy:player-ready', 'b', playing()),
      snap('spy:ask-question', 'a', playing()),
    ])
    expect(spy.map((s) => s.snapshotIds)).toEqual([['s0', 's1', 's2'], ['s3']])

    const submitted = playing({ drawing: 'final' })
    const sketch = groupSteps('sketch_and_guess', [snap('save-drawing', 'a', playing()), snap('submit-drawing', 'a', submitted, { strokes: 3 })])
    expect(sketch).toHaveLength(1)
    expect(sketch[0].action).toBe('submit-drawing')
    expect(sketch[0].state).toBe(submitted)
    expect(sketch[0].payload).toEqual({ strokes: 3 })
  })

  it('hides Alias team assignment and merges the round start into the turn change', () => {
    const steps = groupSteps('alias', [
      snap('game:start', null, playing()),
      snap('assign_team', 'a', playing()),
      snap('next_turn', 'a', playing()),
      snap('start_round', 'a', playing({ round: 1 })),
      snap('word_action', 'a', playing()),
    ])

    expect(steps.map((s) => s.action)).toEqual(['game:start', 'next_turn', 'word_action'])
    expect(steps[1].snapshotIds).toEqual(['s2', 's3'])
  })
})
