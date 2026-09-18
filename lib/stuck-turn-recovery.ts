/**
 * Getting a game unstuck when the player whose turn it is has vanished (#989).
 *
 * A turn timeout is only ever submitted by the browser of the player whose turn
 * it is. Close that tab and nobody is left to submit anything: every other
 * client's `onTimeout` returns "handled, do nothing", the move-based games have
 * no server-side timeout, and the board sits on a dead turn until somebody
 * reloads — which abandons the game and credits nobody.
 *
 * The recovery is indirect and costs no new server code. `sweepStalePlayers`
 * runs on `GET /api/lobby/[code]`, marks a player gone once their heartbeat is
 * 30 s stale, and the leave path (#992) then steps the turn off their seat and
 * broadcasts. So the fix is simply: when the clock runs out on somebody else's
 * turn, ask the server. The catch is that the answer is not ready yet — the
 * timer fires at the turn limit, which can be well inside those 30 s — so this
 * has to keep asking for a while and then stop.
 *
 * Hence a throttle rather than a single call: at most one request per
 * `minIntervalMs`, at most `maxAttempts` of them per turn, and then silence. A
 * frozen table of four therefore produces four requests every ten seconds for a
 * minute, not four every 1.5 s forever (the timer's own retry cadence).
 */

export interface StuckTurnRecoveryOptions {
  /** How long to leave between requests. Must comfortably exceed nothing; the default clears the 30 s presence threshold in three tries. */
  minIntervalMs?: number
  /** How many requests before giving up on this turn. */
  maxAttempts?: number
}

/** `resync` – ask the server now. `wait` – too soon, ask again later. `give-up` – stop asking for this turn. */
export type StuckTurnDecision = 'resync' | 'wait' | 'give-up'

export const DEFAULT_MIN_INTERVAL_MS = 10_000
export const DEFAULT_MAX_ATTEMPTS = 6

export interface StuckTurnRecovery {
  decide(turnSignature: string, nowMs: number): StuckTurnDecision
  reset(): void
}

export function createStuckTurnRecovery(options: StuckTurnRecoveryOptions = {}): StuckTurnRecovery {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  let signature: string | null = null
  let attempts = 0
  let lastAttemptAtMs = 0

  return {
    decide(turnSignature: string, nowMs: number): StuckTurnDecision {
      // A new turn is a fresh problem: whatever happened on the last one is over.
      if (turnSignature !== signature) {
        signature = turnSignature
        attempts = 0
        lastAttemptAtMs = 0
      }

      if (attempts >= maxAttempts) return 'give-up'

      // The first ask goes out immediately — the player may simply have left,
      // in which case the sweep already has what it needs.
      if (attempts > 0 && nowMs - lastAttemptAtMs < minIntervalMs) return 'wait'

      attempts += 1
      lastAttemptAtMs = nowMs
      return 'resync'
    },

    reset() {
      signature = null
      attempts = 0
      lastAttemptAtMs = 0
    },
  }
}

/** The signature the game timer uses for a turn; recovery restarts whenever it changes. */
export function turnSignatureOf(currentPlayerIndex: unknown, lastMoveAt: unknown): string {
  const index = typeof currentPlayerIndex === 'number' ? currentPlayerIndex : 'none'
  const stamp = typeof lastMoveAt === 'number' ? lastMoveAt : 'none'
  return `${index}:${stamp}`
}
