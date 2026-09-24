# Retention periods

How long Boardly keeps each kind of personal data, and what deletes it (#1130).
GDPR Art. 5(1)(e): personal data is kept "slik at det ikke er mulig å identifisere de
registrerte i lengre perioder enn det som er nødvendig for formålene" (Lovdata,
personopplysningsloven § 1, ARTIKKEL_5). The periods for the tables that used to be kept
forever live in one module, `lib/data-retention.ts`, and the daily maintenance cron
(`app/api/cron/maintenance/route.ts`) enforces them. Change a period there, here and on
`/privacy` together.

## Periods the maintenance cron enforces

| Table | Kept for | Clock starts at | Purpose | Mechanism |
|---|---|---|---|---|
| `Games` (+ `Players`, `GameStateSnapshots` by cascade) | 12 months | end of the game; finished, abandoned and cancelled games only | Game history and statistics shown to the players | `lib/data-retention.ts` `games` |
| `Lobbies` (+ `LobbyInvites` by cascade) | 12 months | creation; inactive lobbies with no game left in them | Lobby name, code and creator of the games played in it | `lobbies` |
| `LobbyParticipations` | 24 months | joining the lobby | Pseudonymous join counts (salted hash, no id or name) for year-over-year analytics | `lobbyParticipations` |
| `OperationalEvents` | 180 days | the event | Reliability monitoring and alerting (`site_silent` and the other rules read days, not months) | `operationalEvents` |
| `Feedback` (message, optional email, page URL) | 12 months | submission | Answering and acting on feedback | `feedback` |
| `Notifications` | 12 months | creation | Notification inbox and delivery de-duplication | `notifications` |
| `AdminAuditLogs` | 24 months | the admin action | Accountability for Control Panel actions | `adminAuditLogs` |
| `GameStateSnapshots` (replays) | 90 days | the snapshot | Game replays | `lib/cleanup-replays.ts`, `REPLAY_RETENTION_DAYS` |
| Unverified accounts | 7 days | sign-up | Email verification | `lib/cleanup-unverified.ts` |
| Guest accounts | 3 days idle; 90 days idle for a guest who played | last activity | Playing without an account | `scripts/cleanup-old-guests.ts`, `CLEANUP_GUEST_DAYS` |
| Lobby chat | 24 hours | the message | In-game chat | Redis TTL, `lib/chat-history.ts` |

Counted read-only on production on 2026-09-24, every rule in `lib/data-retention.ts`
matched **0** rows (oldest rows: Games and Lobbies 2026-02-06, Feedback 2026-04-25,
AdminAuditLogs 2026-05-07, OperationalEvents 2026-06-22, Notifications 2026-06-23,
LobbyParticipations 2026-09-04). So every rule is on by default. The first rows to age
out are OperationalEvents around 2026-12-19; Games and Lobbies follow from 2027-02-06.

### Report mode and `RETENTION_ENFORCE`

Each rule has `enforceByDefault`. A new rule that would delete rows that exist today
ships with it `false`: it only counts, and the count lands in the `cron_run` heartbeat
payload as `retention_<rule>_matched` (enforced rules write `retention_<rule>_deleted`).
`RETENTION_ENFORCE=false` switches the whole run to report mode, `RETENTION_ENFORCE=true`
enforces every rule; unset, each rule follows its own default.

## Kept for the life of the account

Deleted with the account (the rows cascade from `Users`), and the account itself stays
until its owner deletes it (`/api/user/request-deletion` → `/api/user/delete-account`):

`Users`, `Accounts` (linked sign-in providers), `AccountPreferences`,
`NotificationPreferences`, `PushSubscriptions`, `UserAchievements`, `FriendRequests`,
`Friendships`, `PurchaseConsents`, `Bots`.

`PasswordResetTokens` and `EmailVerificationTokens` are deleted when used, when a newer
one replaces them, or with the account; no expired row existed on 2026-09-24.

## Not personal data

`StripeWebhookEvents` (event id and type), `SpyLocations`, `Announcements`,
`RuntimeFlags`, `OperationalAlertStates`.

## Outside this repo

`AnalyticsUserFacts` and `ChangelogChecklistItems` belong to the Control Panel
(`~/Projects/boardly-control-panel`); their retention is set there.

## Access and portability

`GET /api/user/export` (#1127) returns a signed-in user's own data as a JSON file:
profile, preferences, linked sign-in providers, games, lobbies created, purchases and
purchase consents, friends and friend requests, lobby invites, notifications, feedback,
achievements and push subscriptions (without their keys). The profile page's Account tab
has the button. A guest, or a request covering data the export does not include
(`AdminAuditLogs` about the user, `OperationalEvents`), is handled by email to
support@boardly.online within one month (GDPR Art. 12(3)).
