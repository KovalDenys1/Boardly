import { MOTION_MS } from '@/lib/motion-durations'

/** The `rps-shake` in app/globals.css: three --bd-dur beats. */
export const RPS_SHAKE_MS = MOTION_MS.base * 3

/** When the reveal has finished: the fists shake, then the throw flips in over --bd-dur-slow (`rps-flip`). */
export const RPS_REVEAL_MS = RPS_SHAKE_MS + MOTION_MS.slow

/** The final round's result overlay waits for the reveal plus a beat to read it (#1200). */
export const RPS_RESULT_REVEAL_DELAY_MS = RPS_REVEAL_MS + 900
