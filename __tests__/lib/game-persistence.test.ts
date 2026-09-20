import { buildGameStartFields, buildPartyGameTerminalUpdate, type DbPlayerRecord } from '@/lib/game-persistence'

const dbPlayer = (userId: string, overrides: Partial<DbPlayerRecord> = {}): DbPlayerRecord => ({
  id: `db-${userId}`,
  userId,
  score: 0,
  scorecard: null,
  finalScore: null,
  placement: null,
  isWinner: false,
  ...overrides,
})

describe('buildPartyGameTerminalUpdate (#729)', () => {
  const startedAt = new Date('2026-08-11T10:00:00Z')

  it('returns null when the status did not change', () => {
    expect(
      buildPartyGameTerminalUpdate({
        previousStatus: 'finished',
        state: { status: 'finished', players: [], data: {} },
        startedAt,
        dbPlayers: [],
      })
    ).toBeNull()
  })

  it('returns null when the new status is not terminal', () => {
    expect(
      buildPartyGameTerminalUpdate({
        previousStatus: 'waiting',
        state: { status: 'playing', players: [], data: {} },
        startedAt,
        dbPlayers: [],
      })
    ).toBeNull()
  })

  it('derives isWinner/finalScore/placement from data.ranking for the ranking games', () => {
    // Shape mirrors liars_party / fake_artist / sketch_and_guess /
    // telephone_doodle: scores mirrored onto players[], ranking best-first.
    const update = buildPartyGameTerminalUpdate({
      previousStatus: 'playing',
      state: {
        status: 'finished',
        winner: 'u2',
        players: [
          { id: 'u1', name: 'One', score: 40 },
          { id: 'u2', name: 'Two', score: 90 },
          { id: 'u3', name: 'Three', score: 10 },
        ],
        data: { ranking: ['u2', 'u1', 'u3'], winnerId: 'u2' },
      },
      startedAt,
      dbPlayers: [dbPlayer('u1', { score: 40 }), dbPlayer('u2', { score: 90 }), dbPlayer('u3', { score: 10 })],
    })

    expect(update).not.toBeNull()
    expect(update!.terminalFields.endedAt).toBeInstanceOf(Date)
    expect(typeof update!.terminalFields.durationSeconds).toBe('number')

    const byId = new Map(update!.changedPlayerUpdates.map((entry) => [entry.id, entry]))
    expect(byId.get('db-u2')).toMatchObject({ isWinner: true, placement: 1, finalScore: 90 })
    expect(byId.get('db-u1')).toMatchObject({ isWinner: false, placement: 2, finalScore: 40 })
    expect(byId.get('db-u3')).toMatchObject({ isWinner: false, placement: 3, finalScore: 10 })
  })

  it('prefers data.scores over the stale players[].score for engines that never mirror them (guess_the_spy)', () => {
    // Spy's base-engine players carry `score: 0` forever — data.scores is the
    // only place real totals live. The stale 0 must not win (caught live in
    // the #729 E2E: every player got finalScore 0 and join-order placement).
    const update = buildPartyGameTerminalUpdate({
      previousStatus: 'playing',
      state: {
        status: 'finished',
        winner: 'u1',
        players: [
          { id: 'u1', name: 'One', score: 0 },
          { id: 'u2', name: 'Two', score: 0 },
          { id: 'u3', name: 'Three', score: 0 },
        ],
        data: { scores: { u1: 290, u2: 50, u3: -10 } },
      },
      startedAt,
      dbPlayers: [dbPlayer('u1'), dbPlayer('u2'), dbPlayer('u3')],
    })

    expect(update).not.toBeNull()
    const byId = new Map(update!.changedPlayerUpdates.map((entry) => [entry.id, entry]))
    expect(byId.get('db-u1')).toMatchObject({ isWinner: true, placement: 1, finalScore: 290, score: 290 })
    expect(byId.get('db-u2')).toMatchObject({ isWinner: false, placement: 2, finalScore: 50 })
    expect(byId.get('db-u3')).toMatchObject({ isWinner: false, placement: 3, finalScore: -10 })
  })

  it('marks nobody as winner on a draw (winner unset)', () => {
    const update = buildPartyGameTerminalUpdate({
      previousStatus: 'playing',
      state: {
        status: 'finished',
        players: [
          { id: 'u1', name: 'One' },
          { id: 'u2', name: 'Two' },
        ],
        data: { scores: { u1: 290, u2: 290 } },
      },
      startedAt,
      dbPlayers: [dbPlayer('u1'), dbPlayer('u2')],
    })

    expect(update).not.toBeNull()
    for (const entry of update!.changedPlayerUpdates) {
      expect(entry.isWinner).toBe(false)
    }
    const metadata = update!.terminalFields.terminalMetadata as { isDraw?: boolean; winnerUserId?: string | null }
    expect(metadata.isDraw).toBe(true)
    expect(metadata.winnerUserId).toBeNull()
  })

  it('rejects a winner id that does not match any real player', () => {
    const update = buildPartyGameTerminalUpdate({
      previousStatus: 'playing',
      state: {
        status: 'finished',
        winner: 'not-a-player',
        players: [{ id: 'u1', name: 'One', score: 5 }],
        data: {},
      },
      startedAt,
      dbPlayers: [dbPlayer('u1')],
    })

    expect(update).not.toBeNull()
    const metadata = update!.terminalFields.terminalMetadata as { winnerUserId?: string | null }
    expect(metadata.winnerUserId).toBeNull()
    expect(update!.changedPlayerUpdates.every((entry) => entry.isWinner === false)).toBe(true)
  })

  it('produces terminal fields for abandoned games too', () => {
    const update = buildPartyGameTerminalUpdate({
      previousStatus: 'playing',
      state: {
        status: 'abandoned',
        players: [{ id: 'u1', name: 'One', score: 5 }],
        data: {},
      },
      startedAt,
      dbPlayers: [dbPlayer('u1')],
    })

    expect(update).not.toBeNull()
    const metadata = update!.terminalFields.terminalMetadata as { outcome?: string; isDraw?: boolean }
    expect(metadata.outcome).toBe('abandoned')
    expect(metadata.isDraw).toBe(false)
  })
})

describe('buildGameStartFields (#1048)', () => {
  const now = new Date('2026-09-20T12:00:00.000Z')

  it('starts the move clock at the start, not at the waiting row', () => {
    const fields = buildGameStartFields(now)

    expect(fields.startedAt).toEqual(now)
    expect(fields.lastMoveAt).toEqual(now)
    expect(fields.updatedAt).toEqual(now)
  })

  it('reads as zero seconds of play before the first move, never a negative', () => {
    // The column used to hold the waiting row's `@default(now())` - a lobby that
    // had been open forty minutes by the time the host pressed start - and
    // lastMoveAt - startedAt was read as seconds of real play, which is where
    // tic_tac_toe's "minus 1s median" came from. A game nobody has moved in has
    // played for zero seconds.
    const fields = buildGameStartFields(now)

    expect(fields.lastMoveAt.getTime() - fields.startedAt.getTime()).toBe(0)
  })

  it('leaves no gap for the recurrence counter to read as a defect', () => {
    // lib/lobby-health.ts counts a playing game as unstamped when lastMoveAt is
    // STRICTLY before startedAt. That operator is only correct because these two
    // are the same instant: a lastMoveAt even a millisecond behind startedAt here
    // would make every healthy start show up in that count forever.
    const fields = buildGameStartFields(now)

    expect(fields.lastMoveAt.getTime()).toBe(fields.startedAt.getTime())
  })

  it('defaults to the current time when called with no argument', () => {
    // How the route calls it. The bound is loose on purpose - the point is that
    // the default is a fresh clock reading, not a fixed or absent one.
    const before = Date.now()
    const fields = buildGameStartFields()
    const after = Date.now()

    expect(fields.startedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(fields.startedAt.getTime()).toBeLessThanOrEqual(after)
    expect(fields.lastMoveAt.getTime()).toBe(fields.startedAt.getTime())
  })
})
