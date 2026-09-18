export type SketchAndGuessPhase = 'drawing' | 'guessing' | 'reveal'

/**
 * How long each Sketch & Guess phase lasts, in seconds (#1022).
 *
 * Drawing gets longer than guessing because it is the harder thing to do against
 * a clock; reveal is only a beat before the next round. These belong to the game
 * rather than to the lobby's turn timer, which has to describe a turn in
 * tic-tac-toe as well — one number suits a drawing and a guess equally badly.
 *
 * They live in their own module so the page can show the same clock the engine
 * enforces without importing the engine, which drags server-side code into the
 * bundle. The engine is the one that acts on them; this file is the agreement.
 */
export const SKETCH_PHASE_SECONDS: Record<SketchAndGuessPhase, number> = {
  drawing: 90,
  guessing: 60,
  reveal: 8,
}
