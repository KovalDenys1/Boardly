import { CHAT_RETENTION_HOURS, RETENTION_DAYS } from './retention-periods'

/**
 * The version of the legal text a Premium buyer agrees to at checkout (#1162).
 *
 * Both are dates and both are bumped BY HAND when the text changes: nothing
 * derives them. The checkout route refuses a consent recorded against any other
 * version, so a tab left open across a change of terms cannot buy under text
 * that is no longer shown, and /terms prints TERMS_VERSION (/privacy its own
 * PRIVACY_UPDATED) as its "Last updated" date instead of whatever day the page
 * happened to render.
 *
 * __tests__/lib/legal-text-versions.test.ts pins each of TERMS_VERSION and
 * WITHDRAWAL_INFO_VERSION to a digest of the English text it covers, so
 * changing that text without a bump fails CI (#1179).
 */

/**
 * When the current Terms of Service took effect.
 * 2026-09-27: the whole of /terms rewritten and translated (#1166), the community
 * rules and moderation (#1173) and the content-notice address (#1172) added.
 */
export const TERMS_VERSION = '2026-09-27'

/**
 * The numbers the Terms print (#1166), from the module the cleanup jobs read, so
 * the Terms cannot promise a period the code does not keep. They are part of the
 * Terms' text: the digest test covers them, so changing one means a new
 * TERMS_VERSION as well as a new PRIVACY_UPDATED.
 */
export const TERMS_FIGURES = {
  guestIdle: RETENTION_DAYS.guestIdle,
  guestPlayed: RETENTION_DAYS.guestPlayedIdle,
  unverifiedDays: RETENTION_DAYS.unverifiedAccounts,
  chatHours: CHAT_RETENTION_HOURS,
} as const

/**
 * When the current Privacy Policy took effect (#1126). Separate from
 * TERMS_VERSION on purpose: a privacy-notice edit must not invalidate the
 * consent a buyer recorded at checkout against the Terms. Bump by hand
 * whenever the text of /privacy or the retention numbers it prints change.
 */
export const PRIVACY_UPDATED = '2026-09-27'

/**
 * When the current withdrawal information on /premium and /withdrawal took effect.
 * 2026-09-27: the consent box also carries the age and capacity rule of Terms
 * section 3 (#1169, vergemålsloven § 12).
 */
export const WITHDRAWAL_INFO_VERSION = '2026-09-27'
