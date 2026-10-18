/** Must equal the `rps-shake` duration in app/globals.css. */
export const RPS_SHAKE_MS = 750

/** When the reveal has finished: the fists shake, then the throw flips in over 0.35 s (app/globals.css). */
export const RPS_REVEAL_MS = RPS_SHAKE_MS + 350

/** The final round's result overlay waits for the reveal plus a beat to read it (#1200). */
export const RPS_RESULT_REVEAL_DELAY_MS = RPS_REVEAL_MS + 900
