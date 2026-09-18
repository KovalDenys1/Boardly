/**
 * The inventory `npm run db:audit` checks the live database against.
 *
 * It lives beside the script rather than inside it so a test can hold it up
 * against `prisma/schema.prisma` without importing a module that connects to
 * the database and prints a report on import (#974).
 *
 * Every Prisma model belongs here, plus `_prisma_migrations`, which Prisma
 * creates but does not model.
 */

export type PolicyMode = 'required' | 'blocked-direct'

export type ExpectedTable = {
  name: string
  domain: string
  purpose: string
  /**
   * `required` — the table carries at least one policy, normally service_role
   * only. `blocked-direct` — row security is on with no policy at all, so
   * direct access is refused outright and only the server reaches it.
   */
  policyMode: PolicyMode
}

export const EXPECTED_TABLES: ExpectedTable[] = [
  {
    name: '_prisma_migrations',
    domain: 'schema',
    purpose: 'Prisma migration history',
    policyMode: 'required',
  },
  {
    name: 'Users',
    domain: 'identity',
    purpose: 'registered and guest identities, profile flags, roles',
    policyMode: 'required',
  },
  {
    name: 'Accounts',
    domain: 'auth',
    purpose: 'NextAuth provider accounts',
    policyMode: 'required',
  },
  {
    name: 'PasswordResetTokens',
    domain: 'auth',
    purpose: 'password reset tokens',
    policyMode: 'required',
  },
  {
    name: 'EmailVerificationTokens',
    domain: 'auth',
    purpose: 'email verification tokens',
    policyMode: 'required',
  },
  {
    name: 'AccountPreferences',
    domain: 'identity',
    purpose: 'profile privacy, online status, onboarding markers',
    policyMode: 'blocked-direct',
  },
  {
    name: 'Bots',
    domain: 'gameplay',
    purpose: 'bot player metadata',
    policyMode: 'required',
  },
  {
    name: 'Lobbies',
    domain: 'gameplay',
    purpose: 'room setup, creator, spectator settings',
    policyMode: 'required',
  },
  {
    name: 'LobbyInvites',
    domain: 'social',
    purpose: 'invite funnel and conversion analytics',
    policyMode: 'required',
  },
  {
    name: 'LobbyParticipations',
    domain: 'gameplay',
    purpose: 'who sat in which lobby, for rejoin and abandon accounting',
    policyMode: 'required',
  },
  {
    name: 'Games',
    domain: 'gameplay',
    purpose: 'authoritative game state, lifecycle, match timing',
    policyMode: 'required',
  },
  {
    name: 'GameStateSnapshots',
    domain: 'gameplay',
    purpose: 'compressed replay snapshots',
    policyMode: 'required',
  },
  {
    name: 'Players',
    domain: 'gameplay',
    purpose: 'game participants, scores, placements',
    policyMode: 'required',
  },
  {
    name: 'FriendRequests',
    domain: 'social',
    purpose: 'pending and resolved friend requests',
    policyMode: 'required',
  },
  {
    name: 'Friendships',
    domain: 'social',
    purpose: 'accepted friend graph',
    policyMode: 'required',
  },
  {
    name: 'UserAchievements',
    domain: 'social',
    purpose: 'unlocked achievements per user (definitions live in code)',
    policyMode: 'required',
  },
  {
    name: 'SpyLocations',
    domain: 'content',
    purpose: 'Guess the Spy location and role content',
    policyMode: 'required',
  },
  {
    name: 'OperationalEvents',
    domain: 'operations',
    purpose: 'reliability telemetry and KPI source events',
    policyMode: 'required',
  },
  {
    name: 'OperationalAlertStates',
    domain: 'operations',
    purpose: 'alert dedupe and open/resolved state',
    policyMode: 'required',
  },
  {
    name: 'NotificationPreferences',
    domain: 'notifications',
    purpose: 'user notification delivery preferences',
    policyMode: 'required',
  },
  {
    name: 'Notifications',
    domain: 'notifications',
    purpose: 'email and in-app notification queue/history',
    policyMode: 'required',
  },
  {
    name: 'PushSubscriptions',
    domain: 'notifications',
    purpose: 'web push endpoints and keys per device',
    policyMode: 'blocked-direct',
  },
  {
    name: 'StripeWebhookEvents',
    domain: 'billing',
    purpose: 'idempotency ledger for Stripe webhook deliveries',
    policyMode: 'required',
  },
  {
    name: 'AdminAuditLogs',
    domain: 'admin',
    purpose: 'admin action audit trail',
    policyMode: 'required',
  },
  {
    name: 'Announcements',
    domain: 'operations',
    purpose: 'site-wide announcement banners',
    policyMode: 'required',
  },
  {
    name: 'RuntimeFlags',
    domain: 'operations',
    purpose: 'runtime feature flags toggled without a deploy',
    policyMode: 'required',
  },
  {
    name: 'Feedback',
    domain: 'product',
    purpose: 'user feedback and issue reports',
    policyMode: 'blocked-direct',
  },
]

/**
 * Auth tables predate the timestamptz policy and are owned by the NextAuth
 * adapter's own schema, so a naive timestamp there is reported as info rather
 * than as a warning we intend to act on.
 */
export const AUTH_TIMESTAMP_TABLES = new Set([
  'Accounts',
  'PasswordResetTokens',
  'EmailVerificationTokens',
])
