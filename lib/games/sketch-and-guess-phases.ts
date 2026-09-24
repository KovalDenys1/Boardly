/**
 * The phases a Sketch & Guess round moves through (#1082): the drawer picks one
 * of three words, draws it while everyone else guesses as often as they like,
 * and the round is revealed.
 *
 * `guessing` is not a phase any more. It is kept in the type because a game
 * persisted before #1082 can still hold it; the engine reads such a state as a
 * drawing phase with guesses already in it, and the page does the same.
 */
export type SketchAndGuessPhase = 'choosing' | 'drawing' | 'reveal'
export type SketchAndGuessPersistedPhase = SketchAndGuessPhase | 'guessing'

/**
 * How long each Sketch & Guess phase lasts, in seconds (#1022, #1082).
 *
 * Drawing is also the guessing window now, so it is one clock of 80 s rather
 * than 90 s of drawing followed by 60 s of guessing. These belong to the game
 * rather than to the lobby's turn timer, which has to describe a turn in
 * tic-tac-toe as well.
 *
 * They live in their own module so the page can show the same clock the engine
 * enforces without importing the engine, which drags server-side code into the
 * bundle. The engine is the one that acts on them; this file is the agreement.
 */
export const SKETCH_PHASE_SECONDS: Record<SketchAndGuessPhase, number> = {
  choosing: 15,
  drawing: 80,
  reveal: 8,
}

/** The clock for a phase as persisted, reading a pre-#1082 `guessing` as drawing. */
export function sketchPhaseSeconds(phase: SketchAndGuessPersistedPhase | string | undefined): number {
  if (phase === 'choosing' || phase === 'reveal') return SKETCH_PHASE_SECONDS[phase]
  return SKETCH_PHASE_SECONDS.drawing
}

/** A guesser may not send guesses closer together than this. */
export const SKETCH_GUESS_MIN_INTERVAL_MS = 800
/** Nor more than this many in one round. */
export const SKETCH_MAX_GUESSES_PER_ROUND = 40
