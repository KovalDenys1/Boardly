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
  /** Finished, abandoned and cancelled games, from the end of the game. */
  games: 365,
  /** Inactive lobbies with no game left in them, from creation. */
  lobbies: 365,
  /** Pseudonymous lobby-join records (salted hash), from joining. */
  lobbyParticipations: 730,
  /** Operational and reliability events, from the event. */
  operationalEvents: 180,
  /** Feedback messages, from submission. */
  feedback: 365,
  /** In-app, email and push notification records, from creation. */
  notifications: 365,
  /** Control Panel admin audit log, from the admin action. */
  adminAuditLogs: 730,
  /** Game replay snapshots, from the snapshot. */
  replays: 90,
  /** Accounts whose email was never verified, from sign-up. */
  unverifiedAccounts: 7,
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
