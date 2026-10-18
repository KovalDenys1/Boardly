import { CHAT_RETENTION_HOURS, RETENTION_DAYS, retentionMonths } from './retention-periods'

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
 * 2026-10-05: section 2 gains the rule on accounts that are not used (#1224).
 * 2026-10-18: section 1 names all six site languages, German and Spanish as translations
 * only, the four binding versions unchanged (#1472). No obligation changes, so the
 * change notice (lib/terms-change-notice.ts) stays on 2026-10-05 and nobody is re-mailed.
 */
export const TERMS_VERSION = '2026-10-18'

/** Printed in the Terms and the privacy notice, so moving it is a change of terms. */
export const INACTIVITY_RULE_STARTS = '2027-01-01'

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
  inactiveMonths: retentionMonths(RETENTION_DAYS.inactiveAccounts),
  inactiveWarningDays: RETENTION_DAYS.inactiveAccountWarning,
} as const

/**
 * When the current Privacy Policy took effect (#1126). Separate from
 * TERMS_VERSION on purpose: a privacy-notice edit must not invalidate the
 * consent a buyer recorded at checkout against the Terms. Bump by hand
 * whenever the text of /privacy or the retention numbers it prints change.
 * 2026-09-27 (second change that day, #1130): finished games are pseudonymised rather than
 * deleted, a lobby in which no game started is deleted with its games, and accounts are
 * stated as kept until their owner deletes them.
 * 2026-09-27 (third change that day, #1226): the username, picture and leaderboard results
 * are visible to everyone whatever the visibility setting; bio, statistics, achievements,
 * Premium status and online status follow it, except that players in lobbies and games
 * you shared see the Premium badge and the game results there.
 * 2026-10-05 (#1224): the inactive-account rule and its start date; two more kinds of email.
 * 2026-10-18 (#1466): the players you block (on the account, a copy on the device while you
 * are signed in, a guest's on the device), when a guest accepted the Terms, and the block list
 * in the data export.
 * 2026-10-19 (#1468), the day it ships: section 7 gives account deletion its path in the
 * profile and the email route for anyone who cannot sign in, under the anchor
 * /privacy#delete-account that the Google Play listing links to; and section 3 names Google Play
 * as the Android app's distributor, on its own account for its install and crash data.
 */
export const PRIVACY_UPDATED = '2026-10-19'

/**
 * When the current withdrawal information on /premium and /withdrawal took effect.
 * 2026-09-27: the consent box also carries the age and capacity rule of Terms
 * section 3 (#1169, vergemålsloven § 12).
 * 2026-10-18: the same information in German and Spanish (#1472), and the Play app's
 * wording for cancelling, which points to the Premium tab instead of the billing portal
 * (#1465). Both landed before this version was released.
 */
export const WITHDRAWAL_INFO_VERSION = '2026-10-18'
