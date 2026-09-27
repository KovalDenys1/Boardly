/**
 * Every retention period Boardly promises, as plain numbers (#1126, #1130).
 *
 * The one copy: the cleanup jobs read these, and /privacy prints them, so the
 * notice cannot drift from what actually gets deleted. Pure constants with no
 * imports, because the privacy notice renders them in the browser and must not
 * pull Prisma or Redis into the client bundle.
 *
 * Change a number here and in docs/PRIVACY-RETENTION.md together, and bump
 * PRIVACY_UPDATED in lib/terms-version.ts: the notice's text changed.
 */
export const RETENTION_DAYS = {
  /**
   * Finished, abandoned and cancelled games, from the end of the game. Then pseudonymised,
   * not deleted: names, messages and drawings go, scores and results stay (#1130).
   */
  games: 365,
  /**
   * Inactive lobbies, from creation: one in which no game started (all cancelled) is
   * deleted with those games, one that held a real game gets a neutral name and a retired
   * code once its games have been pseudonymised.
   */
  lobbies: 365,
  /** Pseudonymous lobby-join records (salted hash), from joining. */
  lobbyParticipations: 730,
  /** Operational and reliability events, from the event. */
  operationalEvents: 180,
  /** Feedback messages, from submission. */
  feedback: 365,
  /** Player reports of chat, drawings and profiles, with the reported content, from the report (#1172). */
  reports: 365,
  /** In-app, email and push notification records, from creation. */
  notifications: 365,
  /** Control Panel admin audit log, from the admin action. */
  adminAuditLogs: 730,
  /** Game replay snapshots, from the snapshot. */
  replays: 90,
  /** Accounts whose email was never verified, from sign-up. */
  unverifiedAccounts: 7,
  /**
   * Registered accounts, from their last activity (#1130). Never one that has a
   * subscription or ever went to checkout, never a bot, an admin or a suspended account.
   * Not enforced, and not printed on /privacy, until the Terms allow it
   * (TERMS_ALLOW_INACTIVITY_DELETION in lib/inactive-accounts.ts).
   */
  inactiveAccounts: 730,
  /** How long before that deletion the warning email goes out. */
  inactiveAccountWarning: 30,
  /** Guests who never played, from their last activity. */
  guestIdle: 3,
  /** Guests who played at least once, from their last activity. */
  guestPlayedIdle: 90,
  /** The guest identity token on the device, from the last visit. */
  guestIdentityToken: 90,
} as const

/** Lobby chat, kept in Redis with this time-to-live. */
export const CHAT_RETENTION_HOURS = 24

/** Days as whole months, the way the notice states the longer periods. */
export function retentionMonths(days: number): number {
  return Math.round(days / (365 / 12))
}
