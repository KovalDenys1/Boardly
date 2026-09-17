import {
  createFreshnessWatermark,
  decideFreshness,
  readLastMoveAt,
  resetFreshnessWatermark,
} from '@/lib/game-state-freshness'

describe('game state freshness (#985)', () => {
  it('reads lastMoveAt only when it is a finite number', () => {
    expect(readLastMoveAt({ lastMoveAt: 5 })).toBe(5)
    expect(readLastMoveAt({ lastMoveAt: 'x' })).toBeNull()
    expect(readLastMoveAt({})).toBeNull()
    expect(readLastMoveAt(null)).toBeNull()
  })

  it('accepts the first snapshot and then only strictly newer ones', () => {
    const w = createFreshnessWatermark()
    expect(decideFreshness(w, { lastMoveAt: 100 }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 200 }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 150 })).toEqual({ accept: false, reason: 'older-than-applied' })
  })

  it('rejects a rebroadcast of the state already on screen', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 })
    expect(decideFreshness(w, { lastMoveAt: 100 })).toEqual({ accept: false, reason: 'older-than-applied' })
  })

  it('drops any unsolicited snapshot while the player has a move in flight', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 })
    expect(decideFreshness(w, { lastMoveAt: 999 }, { moveInFlight: true })).toEqual({
      accept: false,
      reason: 'move-in-flight',
    })
  })

  it('always applies the response to the player own move, and moves the watermark', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 500 })
    // A trusted response wins even when it looks older than the watermark, and
    // even while another move is in flight — it is what unsticks the board.
    expect(decideFreshness(w, { lastMoveAt: 300 }, { trusted: true, moveInFlight: true }).accept).toBe(true)
    expect(w.current).toBe(300)
    expect(decideFreshness(w, { lastMoveAt: 400 }).accept).toBe(true)
  })

  it('accepts a snapshot with no lastMoveAt rather than guessing', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 })
    expect(decideFreshness(w, { status: 'playing' }).accept).toBe(true)
  })

  it('a rematch clears the watermark so the new series is not blocked', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 9_999 })
    resetFreshnessWatermark(w)
    expect(w.current).toBeNull()
    expect(decideFreshness(w, { lastMoveAt: 1 }).accept).toBe(true)
  })
})
