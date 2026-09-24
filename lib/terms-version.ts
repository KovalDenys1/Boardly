/**
 * The version of the legal text a Premium buyer agrees to at checkout (#1162).
 *
 * Both are dates and both are bumped BY HAND when the text changes: nothing
 * derives them. The checkout route refuses a consent recorded against any other
 * version, so a tab left open across a change of terms cannot buy under text
 * that is no longer shown, and /terms and /privacy print TERMS_VERSION as their
 * "Last updated" date instead of whatever day the page happened to render.
 */

/** When the current Terms of Service and Privacy Policy took effect. */
export const TERMS_VERSION = '2026-09-24'

/** When the current withdrawal information on /premium and /withdrawal took effect. */
export const WITHDRAWAL_INFO_VERSION = '2026-09-24'

/**
 * A version date as /terms and /privacy have always shown it: "September 24,
 * 2026". Pinned to UTC so a date-only string does not slip a day west of it.
 */
export function formatLegalDate(version: string): string {
  return new Date(`${version}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
