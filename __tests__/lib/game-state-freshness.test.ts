import {
  createFreshnessWatermark,
  decideFreshness,
  readGameStateId,
  isUpdateForAnotherGame,
  readLastMoveAt,
  resetFreshnessWatermark,
  advanceLifecycleStatus,
} from '@/lib/game-state-freshness'

describe('game state freshness (#985)', () => {
  it('reads lastMoveAt only when it is a finite number', () => {
    expect(readLastMoveAt({ lastMoveAt: 5 })).toBe(5)
    expect(readLastMoveAt({ lastMoveAt: 'x' })).toBeNull()
    expect(readLastMoveAt({})).toBeNull()
    expect(readLastMoveAt(null)).toBeNull()
  })

  it('reads the game id only when the snapshot names one', () => {
    expect(readGameStateId({ id: 'game-1' })).toBe('game-1')
    expect(readGameStateId({ id: '' })).toBeNull()
    expect(readGameStateId({ id: 7 })).toBeNull()
    expect(readGameStateId({})).toBeNull()
    expect(readGameStateId(null)).toBeNull()
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

// #1160: the #994 rematch guard compared the snapshot's `state.id` with the DB
// row id. Engines are created in POST /api/game/create with `game_${Date.now()}`,
// so the two never match and every game-update broadcast was dropped – Memory,
// Yahtzee and Spy (the games on LobbyPageClient) stopped showing moves on 18.09.
describe('isUpdateForAnotherGame (#1160)', () => {
  it('never judges by the engine id inside the state', () => {
    const payload = { action: 'state-change', payload: { id: 'game_1790239727412', lastMoveAt: 1 } }
    expect(isUpdateForAnotherGame(payload, 'cmufaicvc0001zwsidpd6gf95')).toBe(false)
  })

  it('drops an update the server tags with a different game row', () => {
    expect(isUpdateForAnotherGame({ action: 'state-change', gameId: 'cm-rematch', payload: {} }, 'cm-current')).toBe(true)
    expect(isUpdateForAnotherGame({ action: 'state-change', gameId: 'cm-current', payload: {} }, 'cm-current')).toBe(false)
  })

  it('accepts an untagged update', () => {
    expect(isUpdateForAnotherGame({ action: 'state-change', payload: {} }, 'cm-current')).toBe(false)
    expect(isUpdateForAnotherGame(null, 'cm-current')).toBe(false)
  })
})

describe('advanceLifecycleStatus (#1183)', () => {
  it('moves a waiting game forward to playing or finished', () => {
    expect(advanceLifecycleStatus('waiting', 'playing')).toBe('playing')
    expect(advanceLifecycleStatus('waiting', 'finished')).toBe('finished')
    expect(advanceLifecycleStatus('playing', 'finished')).toBe('finished')
  })

  it('never moves a game backward, so a stale snapshot cannot rewind the lifecycle', () => {
    expect(advanceLifecycleStatus('playing', 'waiting')).toBe('playing')
    expect(advanceLifecycleStatus('finished', 'playing')).toBe('finished')
    expect(advanceLifecycleStatus('playing', 'playing')).toBe('playing')
  })

  it('ignores anything that is not a lifecycle status', () => {
    expect(advanceLifecycleStatus('waiting', undefined)).toBe('waiting')
    expect(advanceLifecycleStatus('waiting', 'abandoned')).toBe('waiting')
    expect(advanceLifecycleStatus('waiting', 42)).toBe('waiting')
  })
})
