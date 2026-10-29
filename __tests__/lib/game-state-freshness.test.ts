import {
  createFreshnessWatermark,
  decideFreshness,
  MAX_WATERMARK_LEAD_MS,
  readGameStateId,
  isUpdateForAnotherGame,
  readLastMoveAt,
  resetFreshnessWatermark,
  advanceLifecycleStatus,
  keepBoardFromDroppedSnapshot,
  takeMissedSnapshot,
  beginLobbyRead,
  lobbyFromRead,
  rosterForRead,
  takePlayerLeftFrame,
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

// GHSA-g868-9224-wr3p: the watermark only goes up, so a snapshot stamped far in
// the future used to make every real move after it look stale until the
// player's own next move.
describe('decideFreshness and far-future stamps', () => {
  const now = 1_000_000_000_000

  it('applies a snapshot stamped beyond the lead but does not let it raise the bar', () => {
    const w = createFreshnessWatermark()
    expect(decideFreshness(w, { lastMoveAt: now - 5 }, { now }).accept).toBe(true)

    expect(decideFreshness(w, { lastMoveAt: now + 10 ** 9 }, { now }).accept).toBe(true)
    expect(w.current).toBe(now - 5)

    // The next real move still lands.
    expect(decideFreshness(w, { lastMoveAt: now + 1 }, { now }).accept).toBe(true)
    expect(w.current).toBe(now + 1)
  })

  it('still moves the watermark for a stamp within the lead, so a slightly fast server clock is fine', () => {
    const w = createFreshnessWatermark()
    expect(decideFreshness(w, { lastMoveAt: now + MAX_WATERMARK_LEAD_MS }, { now }).accept).toBe(true)
    expect(w.current).toBe(now + MAX_WATERMARK_LEAD_MS)
  })
})

// #1521: a lobby snapshot answers with the state as of when its request left the
// server, and on a slow server it lands after the move or broadcast that
// overtook it. Pages used to pass it as trusted, so it put the older board back.
describe('decideFreshness for a lobby snapshot (#1521)', () => {
  it('drops the older of two answers in flight when the move answer lands first', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true })
    // A snapshot request leaves, then the player moves; the move is answered first.
    expect(decideFreshness(w, { lastMoveAt: 200 }, { trusted: true }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true })).toEqual({ accept: false, reason: 'older-than-applied' })
    expect(w.current).toBe(200)
  })

  it('drops a snapshot of the board the move was made on when it lands while the move is in flight', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true })
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, moveInFlight: true })).toEqual({
      accept: false,
      reason: 'move-in-flight',
    })
  })

  it('takes a snapshot stamped newer while the move is in flight, since it holds a change the board has not seen (#995)', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true })
    expect(decideFreshness(w, { lastMoveAt: 150 }, { snapshot: true, moveInFlight: true }).accept).toBe(true)
    expect(w.current).toBe(150)
  })

  it('drops the older of two crossing snapshots when it lands last', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true })
    expect(decideFreshness(w, { lastMoveAt: 200 }, { snapshot: true }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true }).accept).toBe(false)
  })

  it('takes a snapshot with the stamp already on screen, since a timeout or a sweep changes the game without a new stamp', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { trusted: true })
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true }).accept).toBe(true)
    expect(w.current).toBe(100)
  })

  it("drops the player's own move answer when a lobby answer newer than it landed while it was in flight", () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true })
    expect(decideFreshness(w, { lastMoveAt: 300 }, { snapshot: true, moveInFlight: true }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 200 }, { trusted: true })).toEqual({ accept: false, reason: 'older-than-applied' })
    expect(w.current).toBe(300)
    // Only that move's answer: the next one is trusted again.
    expect(decideFreshness(w, { lastMoveAt: 250 }, { trusted: true }).accept).toBe(true)
  })

  it('trusts a reconcile after the server refused the move, while the move still counts as in flight', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 200 }, { snapshot: true })
    expect(decideFreshness(w, { lastMoveAt: 200 }, { snapshot: true, trusted: true, moveInFlight: true }).accept).toBe(true)
  })
})

describe('keepBoardFromDroppedSnapshot (#1521)', () => {
  const onScreen = { id: 'game-1', status: 'playing', players: ['a', 'b'], state: 'board-on-screen' }
  const sameAge = { accept: false, reason: 'move-in-flight' } as const
  const older = { accept: false, reason: 'older-than-applied' } as const

  it('takes nothing from an answer older than the board: not its finished status, not its roster', () => {
    const finishedRound = { id: 'game-1', status: 'finished', players: ['a', 'b', 'swept'], state: 'older-board' }
    expect(keepBoardFromDroppedSnapshot(onScreen, finishedRound, older)).toBe(onScreen)
  })

  it('takes the roster from an answer as old as the board under a move in flight', () => {
    const current = { id: 'game-1', status: 'playing', players: ['a'], state: 'board-the-move-was-made-on' }
    expect(keepBoardFromDroppedSnapshot(onScreen, current, sameAge)).toEqual({ id: 'game-1', status: 'playing', players: ['a'], state: 'board-on-screen' })
  })

  it('keeps the status the move in flight put on screen – an accepted undo of the winning move stays in play', () => {
    const beforeTheUndo = { id: 'game-1', status: 'finished', players: ['a', 'b'], state: 'board-the-move-was-made-on' }
    expect(keepBoardFromDroppedSnapshot(onScreen, beforeTheUndo, sameAge)?.status).toBe('playing')
  })

  it('leaves the game alone when the snapshot is of another game or of none', () => {
    expect(keepBoardFromDroppedSnapshot(onScreen, { id: 'game-2', status: 'finished', players: [] }, sameAge)).toBe(onScreen)
    expect(keepBoardFromDroppedSnapshot(onScreen, null, sameAge)).toBe(onScreen)
    expect(keepBoardFromDroppedSnapshot(null, { id: 'game-1', status: 'playing' }, sameAge)).toBeNull()
  })
})

// #1521 review: a newer snapshot dropped behind a move in flight must not be lost.
describe('takeMissedSnapshot (#1521)', () => {
  it('says once that a newer broadcast was dropped for the move in flight', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 })
    expect(decideFreshness(w, { lastMoveAt: 300 }, { moveInFlight: true }).accept).toBe(false)
    decideFreshness(w, { lastMoveAt: 200 }, { trusted: true })
    expect(takeMissedSnapshot(w)).toBe(true)
    expect(takeMissedSnapshot(w)).toBe(false)
  })

  it('stays quiet when what was dropped is no newer than the board', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 })
    decideFreshness(w, { lastMoveAt: 100 }, { moveInFlight: true })
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, moveInFlight: true })
    decideFreshness(w, { lastMoveAt: 50 }, { moveInFlight: true })
    expect(takeMissedSnapshot(w)).toBe(false)
  })

  it('a reset forgets it', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 })
    decideFreshness(w, { lastMoveAt: 300 }, { moveInFlight: true })
    resetFreshnessWatermark(w)
    expect(takeMissedSnapshot(w)).toBe(false)
  })
})

// #1521 review: a timeout write that loses its row check answers with the state from before the
// timeout under the same lastMoveAt. The state's own updatedAt breaks that tie where both carry it.
describe('decideFreshness with equal lastMoveAt (#1521)', () => {
  const at = (lastMoveAt: number, updatedAt?: string) => ({ lastMoveAt, ...(updatedAt ? { updatedAt } : {}) })

  it('drops the pre-timeout read that lands after the post-timeout one', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, at(100, '2026-10-26T10:00:00.100Z'), { snapshot: true })
    expect(decideFreshness(w, at(100, '2026-10-26T10:01:00.000Z'), { snapshot: true }).accept).toBe(true)
    expect(decideFreshness(w, at(100, '2026-10-26T10:00:00.100Z'), { snapshot: true })).toEqual({ accept: false, reason: 'older-than-applied' })
  })

  it('takes a broadcast with the same lastMoveAt and a newer updatedAt, and still drops a plain rebroadcast', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, at(100, '2026-10-26T10:00:00.100Z'))
    expect(decideFreshness(w, at(100, '2026-10-26T10:00:00.100Z')).accept).toBe(false)
    expect(decideFreshness(w, at(100, '2026-10-26T10:01:00.000Z')).accept).toBe(true)
  })

  it('drops the move answer that ties a read taken after it on lastMoveAt but is older by updatedAt', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, at(100, '2026-10-26T10:00:00.100Z'), { snapshot: true })
    expect(decideFreshness(w, at(200, '2026-10-26T10:00:05.000Z'), { snapshot: true, moveInFlight: true }).accept).toBe(true)
    expect(decideFreshness(w, at(200, '2026-10-26T10:00:00.200Z'), { trusted: true })).toEqual({ accept: false, reason: 'older-than-applied' })
  })

  it('falls back to the lastMoveAt rules when either side has no updatedAt', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, at(100, '2026-10-26T10:01:00.000Z'), { snapshot: true })
    expect(decideFreshness(w, at(100), { snapshot: true }).accept).toBe(true)
    expect(decideFreshness(w, at(100)).accept).toBe(false)
  })
})

// #1528: two lobby reads with the same game state can still land out of order, and the one that
// left first carries the older lobby: a leave sweeps a seat and moves the host without a new stamp.
describe('decideFreshness for numbered lobby reads (#1528)', () => {
  it('an older read landing after a newer one with the same game state changes nothing', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 1 })
    // Reads 2 and 3 are in flight; 3 left after the host moved and lands first.
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 3 })).toEqual({ accept: true, lobby: true })
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 2 })).toEqual({ accept: false, reason: 'superseded-read', lobby: false })
    // Nor does it move anything a later read is judged by.
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 4 })).toEqual({ accept: true, lobby: true })
  })

  it('drops a plain read sent before a later read whose lobby is on screen, though that read lost its board to the move', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 1 })
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 3, moveInFlight: true }).lobby).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 2, moveInFlight: true })).toEqual({ accept: false, reason: 'superseded-read', lobby: false })
  })

  it('lets a reconcile that a later read overtook during the move still bring its board, without its lobby', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 1 })
    // The move is refused and its reconcile (2) leaves; a broadcast sends read 3, which lands first.
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 3, moveInFlight: true })).toEqual({ accept: false, reason: 'move-in-flight', lobby: true })
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 2, trusted: true, moveInFlight: true })).toEqual({ accept: true, lobby: false })
  })

  it('drops a reconcile whose board a later read already replaced', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 1 })
    expect(decideFreshness(w, { lastMoveAt: 200 }, { snapshot: true, read: 3 }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: 2, trusted: true })).toEqual({ accept: false, reason: 'superseded-read', lobby: false })
    expect(w.current).toBe(200)
  })

  it('takes no roster from a read dropped for the move in flight when its lobby is older than the one on screen', () => {
    const onScreen = { id: 'game-1', status: 'playing', players: ['a', 'b'] }
    const dropped = { id: 'game-1', status: 'playing', players: ['a', 'b', 'gone'] }
    expect(keepBoardFromDroppedSnapshot(onScreen, dropped, { accept: false, reason: 'move-in-flight', lobby: false })).toBe(onScreen)
  })
})

// #1528 review: the host only changes when the host leaves, so who has left orders every source of
// the host – frames that arrive newest first, a read answered before the leave, a refused leave read.
describe('the host after a leave (#1528)', () => {
  const lobby = (creatorId: string) => ({ id: 'lobby-1', creatorId, name: 'Lobby' })

  it('a frame naming a host another frame already reported gone is the older leave and changes nothing', () => {
    const w = createFreshnessWatermark()
    expect(takePlayerLeftFrame(w, { userId: 'cara', nextCreatorId: 'alice' })).toBe('alice')
    expect(takePlayerLeftFrame(w, { userId: 'bob', nextCreatorId: 'cara' })).toBeNull()
  })

  it('a read answered before the host left keeps the host the frame named, with or without a lobby on screen', () => {
    const w = createFreshnessWatermark()
    const sentBeforeTheLeave = beginLobbyRead(w)
    takePlayerLeftFrame(w, { userId: 'bob', nextCreatorId: 'alice' })
    const decision = decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: sentBeforeTheLeave })
    expect(lobbyFromRead(w, decision, sentBeforeTheLeave, lobby('bob'), null)).toEqual(lobby('alice'))
    expect(lobbyFromRead(w, decision, sentBeforeTheLeave, lobby('bob'), lobby('alice'))).toEqual(lobby('alice'))
  })

  it('a read sent after a leave was known may name that player host again: they came back', () => {
    const w = createFreshnessWatermark()
    beginLobbyRead(w)
    takePlayerLeftFrame(w, { userId: 'bob' })
    const sentAfter = beginLobbyRead(w)
    const decision = decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: sentAfter })
    expect(lobbyFromRead(w, decision, sentAfter, lobby('bob'), lobby('carl'))).toEqual(lobby('bob'))
  })

  it('a player a read lists as left is never made host by a frame that arrives after it', () => {
    const w = createFreshnessWatermark()
    const read = beginLobbyRead(w)
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read, roster: [{ userId: 'cara', leftAt: '2026-10-26T18:00:00.000Z' }, { userId: 'alice', leftAt: null }] })
    expect(takePlayerLeftFrame(w, { userId: 'bob', nextCreatorId: 'cara' })).toBeNull()
    expect(takePlayerLeftFrame(w, { userId: 'cara', nextCreatorId: 'alice' })).toBe('alice')
  })

  it('a reconcile whose lobby is older than the one on screen brings its board and keeps the roster on screen', () => {
    const onScreen = { id: 'game-1', players: ['a', 'b-left'], state: 'optimistic' }
    const reconcile = { id: 'game-1', players: ['a', 'b'], state: 'server' }
    expect(rosterForRead(reconcile, onScreen, { accept: true, lobby: false })).toEqual({ id: 'game-1', players: ['a', 'b-left'], state: 'server' })
    expect(rosterForRead(reconcile, onScreen, { accept: true, lobby: true })).toBe(reconcile)
    expect(rosterForRead(reconcile, { ...onScreen, id: 'game-0' }, { accept: true, lobby: false })).toBe(reconcile)
  })
})

// #1528 review 2: a read's place is its game-state age first and its send order only among reads
// as old; frames are judged by the server's leave times; only a read that passes the order check
// teaches the page who has left.
describe('read order by age, and frames by leave time (#1528)', () => {
  const lobby = (creatorId: string) => ({ id: 'lobby-1', creatorId })
  const row = (userId: string, leftAt: string | null = null) => ({ userId, leftAt })
  const T1 = '2026-10-26T20:00:01.000Z'
  const T2 = '2026-10-26T20:00:02.000Z'
  const T3 = '2026-10-26T20:00:03.000Z'

  it('a read that left first with a strictly newer board brings it, and its lobby', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: beginLobbyRead(w) })
    const first = beginLobbyRead(w)
    const second = beginLobbyRead(w)
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: second }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: 200 }, { snapshot: true, read: first })).toEqual({ accept: true, lobby: true })
    expect(w.current).toBe(200)
  })

  it('a read dropped as older gives its lobby to nobody, so an earlier reconcile with a newer board still brings its host', () => {
    const w = createFreshnessWatermark()
    const screen = lobbyFromRead(w, decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: beginLobbyRead(w) }), 1, lobby('H'), null)
    decideFreshness(w, { lastMoveAt: 200 }, {})
    const reconcile = beginLobbyRead(w)
    const later = beginLobbyRead(w)
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: later })).toEqual({ accept: false, reason: 'older-than-applied', lobby: true })
    const rec = decideFreshness(w, { lastMoveAt: 200 }, { snapshot: true, read: reconcile, trusted: true })
    expect(rec).toEqual({ accept: true, lobby: true })
    expect(lobbyFromRead(w, rec, reconcile, lobby('A'), screen)?.creatorId).toBe('A')
  })

  it('refuses the older of two host leaves by their times, and takes a host who left before the frame and came back', () => {
    const w = createFreshnessWatermark()
    expect(takePlayerLeftFrame(w, { userId: 'cara', nextCreatorId: 'alice', leftAt: T2 })).toBe('alice')
    expect(takePlayerLeftFrame(w, { userId: 'bob', nextCreatorId: 'cara', leftAt: T1 })).toBeNull()

    const room = createFreshnessWatermark()
    takePlayerLeftFrame(room, { userId: 'A', leftAt: T1 })
    expect(takePlayerLeftFrame(room, { userId: 'H', nextCreatorId: 'A', leftAt: T3 })).toBe('A')
  })

  it('keeps the rejoined host on screen when the join read, answered before the host left, lands after the frame', () => {
    const w = createFreshnessWatermark()
    const land = (read: number, creatorId: string, roster: unknown[], onScreen: { id: string; creatorId: string } | null) =>
      lobbyFromRead(w, decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read, roster }), read, lobby(creatorId), onScreen)
    let screen = land(beginLobbyRead(w), 'H', [row('H'), row('A'), row('V')], null)
    takePlayerLeftFrame(w, { userId: 'A', leftAt: T1 })
    screen = land(beginLobbyRead(w), 'H', [row('H'), row('V')], screen)
    const joinedRead = beginLobbyRead(w)
    const host = takePlayerLeftFrame(w, { userId: 'H', nextCreatorId: 'A', leftAt: T3 })
    expect(host).toBe('A')
    screen = screen && { ...screen, creatorId: 'A' }
    beginLobbyRead(w)
    screen = land(joinedRead, 'H', [row('H'), row('V'), row('A')], screen)
    expect(screen?.creatorId).toBe('A')
  })

  it('learns no departure from a read dropped for its order, such as one from the game before a reset', () => {
    const w = createFreshnessWatermark()
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: beginLobbyRead(w), roster: [row('H'), row('X', T1)] })
    const fromTheOldGame = beginLobbyRead(w)
    resetFreshnessWatermark(w)
    decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: beginLobbyRead(w), roster: [row('H'), row('X')] })
    expect(decideFreshness(w, { lastMoveAt: 100 }, { snapshot: true, read: fromTheOldGame, roster: [row('H'), row('X', T1)] }).reason).toBe('superseded-read')
    expect(w.departed?.X).toBeUndefined()
    expect(takePlayerLeftFrame(w, { userId: 'H', nextCreatorId: 'X', leftAt: T3 })).toBe('X')
  })
})

describe('read marks and the clock lead (#1528)', () => {
  it('a read stamped beyond the lead is applied but does not place every later read behind it', () => {
    const w = createFreshnessWatermark()
    const now = 1_800_000_000_000
    expect(decideFreshness(w, { lastMoveAt: now + 10 * MAX_WATERMARK_LEAD_MS }, { snapshot: true, read: beginLobbyRead(w), now }).accept).toBe(true)
    expect(decideFreshness(w, { lastMoveAt: now + 5_000 }, { snapshot: true, read: beginLobbyRead(w), now: now + 5_000 })).toEqual({ accept: true, lobby: true })
  })
})
