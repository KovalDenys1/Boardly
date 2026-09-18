import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { SKETCH_PHASE_SECONDS } from '@/lib/games/sketch-and-guess-phases'

/**
 * #1022: the game had no clock a client could see, so a drawer who closed their
 * tab stalled the round until somebody reloaded. The phases now end on their own
 * budgets — and on the engine's, not the lobby's single turn timer, which has to
 * describe a tic-tac-toe turn as well.
 */
function playingGame(phase: 'drawing' | 'guessing' | 'reveal', startedAt: number) {
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
    data: { phase: string }
  }
  snapshot.data.phase = phase
  snapshot.lastMoveAt = startedAt

  const game = new SketchAndGuessGame('game-1')
  game.restoreState(snapshot as never)
  return game
}

describe('Sketch & Guess phase clock (#1022)', () => {
  it('gives drawing longer than guessing, and reveal only a beat', () => {
    expect(SKETCH_PHASE_SECONDS.drawing).toBe(90)
    expect(SKETCH_PHASE_SECONDS.guessing).toBe(60)
    expect(SKETCH_PHASE_SECONDS.drawing).toBeGreaterThan(SKETCH_PHASE_SECONDS.guessing)
    expect(SKETCH_PHASE_SECONDS.reveal).toBeLessThan(SKETCH_PHASE_SECONDS.guessing)
  })

  it('leaves a phase alone while it still has time', () => {
    const start = 1_000_000
    const game = playingGame('drawing', start)
    const r = game.applyTimeoutFallback(undefined, start + 89_000)
    expect(r.changed).toBe(false)
  })

  it('ends the drawing phase once its own 90s are up', () => {
    const start = 1_000_000
    const game = playingGame('drawing', start)
    const r = game.applyTimeoutFallback(undefined, start + 90_000)
    expect(r.changed).toBe(true)
    expect(r.phaseTransitions).toBeGreaterThanOrEqual(1)
  })

  it('does not end guessing at the drawing deadline — the budgets are separate', () => {
    // 60s is up for guessing but this asserts the engine is not reusing one number:
    // at 59s nothing happens, at 60s it does.
    const start = 1_000_000
    expect(playingGame('guessing', start).applyTimeoutFallback(undefined, start + 59_000).changed).toBe(false)
    expect(playingGame('guessing', start).applyTimeoutFallback(undefined, start + 60_000).changed).toBe(true)
  })

  it('runs without a lobby turn timer at all, which is the whole point', () => {
    // The other four games are gated on `turnTimerSeconds > 0`; a Sketch lobby
    // created without one used to have no deadline whatsoever.
    const start = 1_000_000
    const game = playingGame('drawing', start)
    expect(game.applyTimeoutFallback(undefined, start + 90_000).changed).toBe(true)
  })

  it('ignores whatever the lobby timer says', () => {
    const start = 1_000_000
    const game = playingGame('drawing', start)
    // A 5s lobby timer must not cut the drawing phase short.
    expect(game.applyTimeoutFallback(5, start + 10_000).changed).toBe(false)
  })
})
