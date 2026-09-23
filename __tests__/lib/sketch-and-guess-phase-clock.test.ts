import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { SKETCH_PHASE_SECONDS, sketchPhaseSeconds } from '@/lib/games/sketch-and-guess-phases'

/**
 * #1022: the game had no clock a client could see, so a drawer who closed their
 * tab stalled the round until somebody reloaded. The phases now end on their own
 * budgets — and on the engine's, not the lobby's single turn timer, which has to
 * describe a tic-tac-toe turn as well. #1082 made it choosing → drawing (which
 * is also when everyone guesses) → reveal, and moved the clock off `lastMoveAt`,
 * which every guess now touches.
 */
function playingGame(phase: 'choosing' | 'drawing' | 'guessing' | 'reveal', startedAt: number) {
  // minPlayers is 3 for this game, so two would leave it in `waiting` and the
  // fallback would return early without ever looking at the clock.
  const seed = new SketchAndGuessGame('game-1')
  seed.addPlayer({ id: 'A', name: 'A' })
  seed.addPlayer({ id: 'B', name: 'B' })
  seed.addPlayer({ id: 'C', name: 'C' })
  seed.startGame()

  // `getState()` hands back a copy, so the phase is set by restoring an edited
  // snapshot — the same route the lobby route takes.
  const snapshot = JSON.parse(JSON.stringify(seed.getState())) as {
    lastMoveAt: number
    data: { phase: string; phaseStartedAt: number | null; rounds: Array<{ word: unknown; wordChoices: unknown[] }> }
  }
  snapshot.data.phase = phase
  snapshot.data.phaseStartedAt = startedAt
  snapshot.lastMoveAt = startedAt
  if (phase !== 'choosing') snapshot.data.rounds[0].word = snapshot.data.rounds[0].wordChoices[0]

  const game = new SketchAndGuessGame('game-1')
  game.restoreState(snapshot as never)
  return game
}

describe('Sketch & Guess phase clock (#1022, #1082)', () => {
  it('gives choosing a short clock, drawing the long one, and reveal only a beat', () => {
    expect(SKETCH_PHASE_SECONDS).toEqual({ choosing: 15, drawing: 80, reveal: 8 })
    expect(SKETCH_PHASE_SECONDS.drawing).toBeGreaterThan(SKETCH_PHASE_SECONDS.choosing)
    expect(SKETCH_PHASE_SECONDS.reveal).toBeLessThan(SKETCH_PHASE_SECONDS.choosing)
  })

  it('reads a persisted pre-#1082 `guessing` phase on the drawing clock', () => {
    expect(sketchPhaseSeconds('guessing')).toBe(SKETCH_PHASE_SECONDS.drawing)
    expect(sketchPhaseSeconds(undefined)).toBe(SKETCH_PHASE_SECONDS.drawing)
  })

  it('leaves a phase alone while it still has time', () => {
    const start = 1_000_000
    const game = playingGame('drawing', start)
    const r = game.applyTimeoutFallback(undefined, start + 79_000)
    expect(r.changed).toBe(false)
  })

  it('ends the drawing phase once its own 80s are up', () => {
    const start = 1_000_000
    const game = playingGame('drawing', start)
    const r = game.applyTimeoutFallback(undefined, start + 80_000)
    expect(r.changed).toBe(true)
    expect(r.phaseTransitions).toBeGreaterThanOrEqual(1)
  })

  it('ends choosing on its own 15s, not the drawing deadline', () => {
    const start = 1_000_000
    expect(playingGame('choosing', start).applyTimeoutFallback(undefined, start + 14_000).changed).toBe(false)
    const game = playingGame('choosing', start)
    const r = game.applyTimeoutFallback(undefined, start + 15_000)
    expect(r.changed).toBe(true)
    expect(r.autoPickedWords).toBe(1)
  })

  it('times a legacy guessing phase out on the drawing clock rather than hanging', () => {
    const start = 1_000_000
    expect(playingGame('guessing', start).applyTimeoutFallback(undefined, start + 79_000).changed).toBe(false)
    expect(playingGame('guessing', start).applyTimeoutFallback(undefined, start + 80_000).changed).toBe(true)
  })

  it('runs without a lobby turn timer at all, which is the whole point', () => {
    // The other four games are gated on `turnTimerSeconds > 0`; a Sketch lobby
    // created without one used to have no deadline whatsoever.
    const start = 1_000_000
    const game = playingGame('drawing', start)
    expect(game.applyTimeoutFallback(undefined, start + 80_000).changed).toBe(true)
  })

  it('ignores whatever the lobby timer says', () => {
    const start = 1_000_000
    const game = playingGame('drawing', start)
    // A 5s lobby timer must not cut the drawing phase short.
    expect(game.applyTimeoutFallback(5, start + 10_000).changed).toBe(false)
  })
})
