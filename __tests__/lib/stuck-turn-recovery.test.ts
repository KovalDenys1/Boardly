import {
  createStuckTurnRecovery,
  turnSignatureOf,
  DEFAULT_MAX_ATTEMPTS,
} from '@/lib/stuck-turn-recovery'

describe('stuck turn recovery (#989)', () => {
  it('asks immediately the first time the clock runs out', () => {
    const r = createStuckTurnRecovery()
    expect(r.decide('0:100', 0)).toBe('resync')
  })

  it('refuses to ask again inside the interval', () => {
    const r = createStuckTurnRecovery({ minIntervalMs: 10_000 })
    expect(r.decide('0:100', 0)).toBe('resync')
    expect(r.decide('0:100', 1_500)).toBe('wait')
    expect(r.decide('0:100', 9_999)).toBe('wait')
    expect(r.decide('0:100', 10_000)).toBe('resync')
  })

  it('outlasts the 30s presence threshold before giving up', () => {
    // The whole point: the sweep cannot mark the player gone until their
    // heartbeat is 30s stale, which is usually after the turn clock expires.
    const r = createStuckTurnRecovery({ minIntervalMs: 10_000, maxAttempts: 6 })
    const asked: number[] = []
    for (let now = 0; now <= 60_000; now += 1_500) {
      if (r.decide('0:100', now) === 'resync') asked.push(now)
    }
    expect(asked[0]).toBe(0)
    expect(asked.at(-1)).toBeGreaterThan(30_000)
    expect(asked).toHaveLength(6)
  })

  it('stops asking once the attempts are spent', () => {
    const r = createStuckTurnRecovery({ minIntervalMs: 0, maxAttempts: 3 })
    expect(r.decide('0:100', 0)).toBe('resync')
    expect(r.decide('0:100', 1)).toBe('resync')
    expect(r.decide('0:100', 2)).toBe('resync')
    expect(r.decide('0:100', 3)).toBe('give-up')
    expect(r.decide('0:100', 99_999)).toBe('give-up')
  })

  it('starts over when the turn moves on', () => {
    const r = createStuckTurnRecovery({ minIntervalMs: 0, maxAttempts: 1 })
    expect(r.decide('0:100', 0)).toBe('resync')
    expect(r.decide('0:100', 1)).toBe('give-up')
    // The turn advanced — a new problem, a new budget.
    expect(r.decide('1:200', 2)).toBe('resync')
  })

  it('reset clears the budget', () => {
    const r = createStuckTurnRecovery({ minIntervalMs: 0, maxAttempts: 1 })
    r.decide('0:100', 0)
    expect(r.decide('0:100', 1)).toBe('give-up')
    r.reset()
    expect(r.decide('0:100', 2)).toBe('resync')
  })

  it('defaults cover a minute of asking', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBeGreaterThanOrEqual(4)
  })

  it('builds a turn signature that survives missing values', () => {
    expect(turnSignatureOf(2, 1700)).toBe('2:1700')
    expect(turnSignatureOf(undefined, undefined)).toBe('none:none')
    expect(turnSignatureOf(0, null)).toBe('0:none')
  })
})
