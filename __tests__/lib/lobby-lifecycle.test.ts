import {
  isTerminalGameStatus,
  lobbyReopenAgeBucket,
  resolveClosedLobbyOutcome,
  resolveLifecycleRedirectReason,
} from '@/lib/lobby-lifecycle'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-10-30T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('resolveClosedLobbyOutcome (#1594)', () => {
  it.each(['finished', 'abandoned', 'cancelled', null])(
    'offers to reopen an inactive lobby under 30 days old whose last game is %s',
    (gameStatus) => {
      expect(
        resolveClosedLobbyOutcome({
          gameStatus,
          lobbyIsActive: false,
          createdAt: ago(3 * HOUR),
          pseudonymisedAt: null,
          now: NOW,
        })
      ).toBe('reopen')
    }
  )

  it('sends a lobby 30 days old or older to the redirect', () => {
    expect(
      resolveClosedLobbyOutcome({
        gameStatus: 'finished',
        lobbyIsActive: false,
        createdAt: ago(30 * DAY),
        pseudonymisedAt: null,
        now: NOW,
      })
    ).toBe('start_new')
  })

  it('sends a pseudonymised lobby to the redirect whatever its age', () => {
    expect(
      resolveClosedLobbyOutcome({
        gameStatus: 'finished',
        lobbyIsActive: false,
        createdAt: ago(2 * HOUR),
        pseudonymisedAt: ago(HOUR),
        now: NOW,
      })
    ).toBe('start_new')
  })

  it('treats a lobby with no readable creation date as too old', () => {
    expect(
      resolveClosedLobbyOutcome({
        gameStatus: null,
        lobbyIsActive: false,
        createdAt: 'not a date',
        pseudonymisedAt: null,
        now: NOW,
      })
    ).toBe('start_new')
  })

  it('sends a table whose game is not available any more to a new table, however young', () => {
    expect(
      resolveClosedLobbyOutcome({
        gameStatus: 'finished',
        lobbyIsActive: false,
        createdAt: ago(HOUR),
        pseudonymisedAt: null,
        gameAvailable: false,
        now: NOW,
      })
    ).toBe('start_new')
  })

  it('leaves an active lobby and a lobby with a waiting or playing game alone', () => {
    const base = { createdAt: ago(HOUR), pseudonymisedAt: null, now: NOW }
    expect(resolveClosedLobbyOutcome({ ...base, gameStatus: 'finished', lobbyIsActive: true })).toBeNull()
    expect(resolveClosedLobbyOutcome({ ...base, gameStatus: 'abandoned', lobbyIsActive: true })).toBeNull()
    expect(resolveClosedLobbyOutcome({ ...base, gameStatus: 'waiting', lobbyIsActive: false })).toBeNull()
    expect(resolveClosedLobbyOutcome({ ...base, gameStatus: 'playing', lobbyIsActive: false })).toBeNull()
    expect(resolveClosedLobbyOutcome({ ...base, gameStatus: 'finished', lobbyIsActive: undefined })).toBeNull()
  })
})

describe('lobbyReopenAgeBucket (#1594)', () => {
  it.each([
    [10 * 60 * 1000, 'under_1h'],
    [2 * HOUR, '1h_to_3h'],
    [5 * HOUR, '3h_to_24h'],
    [3 * DAY, '1d_to_7d'],
    [20 * DAY, '7d_to_30d'],
  ])('puts a lobby %i ms old in %s', (age, bucket) => {
    expect(lobbyReopenAgeBucket(ago(age), NOW)).toBe(bucket)
  })
})

describe('lobby lifecycle helpers', () => {
  it('detects terminal game statuses', () => {
    expect(isTerminalGameStatus('abandoned')).toBe(true)
    expect(isTerminalGameStatus('cancelled')).toBe(true)
    expect(isTerminalGameStatus('finished')).toBe(false)
    expect(isTerminalGameStatus('playing')).toBe(false)
  })

  it('returns local terminal redirect reason for terminal game statuses', () => {
    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'abandoned',
        lobbyIsActive: true,
      })
    ).toBe('local-game-status:abandoned')

    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'cancelled',
        lobbyIsActive: true,
      })
    ).toBe('local-game-status:cancelled')
  })

  it('returns local inactive redirect reason when lobby is inactive and there is no settled game to show', () => {
    expect(
      resolveLifecycleRedirectReason({
        gameStatus: null,
        lobbyIsActive: false,
      })
    ).toBe('local-lobby-inactive')
  })

  it('does not redirect while game is active or finished even if lobby flag is false', () => {
    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'playing',
        lobbyIsActive: false,
      })
    ).toBeNull()

    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'waiting',
        lobbyIsActive: false,
      })
    ).toBeNull()

    expect(
      resolveLifecycleRedirectReason({
        gameStatus: 'finished',
        lobbyIsActive: false,
      })
    ).toBeNull()
  })
})
