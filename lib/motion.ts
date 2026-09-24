/**
 * Shared motion helpers (#1111). The motion itself is CSS (tokens and keyframes
 * in app/globals.css); this is only what JavaScript has to decide – whether to
 * wait for an animation at all.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * True when the viewer asked the OS for less motion. The global CSS rule
 * already collapses every animation and delay; this is for waits that live in
 * JavaScript (a timer before something appears), which CSS cannot shorten.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches
  } catch {
    return false
  }
}
