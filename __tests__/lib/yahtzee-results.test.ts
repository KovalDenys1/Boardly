import { analyzeResults, leadersOf, yahtzeeViewerOutcome } from '@/lib/yahtzee-results'

/** Scorecards whose only entry is chance, so each total is the number given. */
function resultsFor(totals: Record<string, number>) {
  return analyzeResults(
    Object.entries(totals).map(([id, score]) => ({ id, name: id.toUpperCase(), score })),
    (id) => ({ chance: totals[id] }),
  )
}

const seated = { isSpectator: false, isSeated: true }

describe('Yahtzee final standings (#1493)', () => {
  it('gives a shared top total a shared first place', () => {
    const results = resultsFor({ a: 120, b: 120 })
    expect(results.map((r) => r.rank)).toEqual([0, 0])
    expect(leadersOf(results).map((r) => r.playerId)).toEqual(['a', 'b'])
  })

  it('ranks a third player below two tied leaders as third, not second', () => {
    const results = resultsFor({ a: 120, low: 90, b: 120 })
    expect(results.map((r) => [r.playerId, r.rank])).toEqual([['a', 0], ['b', 0], ['low', 2]])
  })

  it('keeps a single winner first and the rest in order', () => {
    expect(resultsFor({ a: 90, b: 120, c: 100 }).map((r) => [r.playerId, r.rank])).toEqual([['b', 0], ['c', 1], ['a', 2]])
  })
})

describe('yahtzeeViewerOutcome (#1493)', () => {
  it('is a draw for a viewer who shares the top total', () => {
    const results = resultsFor({ a: 120, b: 120 })
    expect(yahtzeeViewerOutcome(results, 'a', seated)).toBe('draw')
    expect(yahtzeeViewerOutcome(results, 'b', seated)).toBe('draw')
  })

  it('is a loss for a viewer below a shared top total', () => {
    const results = resultsFor({ a: 120, low: 90, b: 120 })
    expect(yahtzeeViewerOutcome(results, 'a', seated)).toBe('draw')
    expect(yahtzeeViewerOutcome(results, 'low', seated)).toBe('loss')
  })

  it('is unchanged for an outright win', () => {
    const results = resultsFor({ a: 120, b: 90 })
    expect(yahtzeeViewerOutcome(results, 'a', seated)).toBe('win')
    expect(yahtzeeViewerOutcome(results, 'b', seated)).toBe('loss')
  })

  it('gives a spectator no outcome, so they hear only that it is over', () => {
    expect(yahtzeeViewerOutcome(resultsFor({ a: 120, b: 120 }), 'watcher', { isSpectator: true, isSeated: false })).toBeUndefined()
  })
})
