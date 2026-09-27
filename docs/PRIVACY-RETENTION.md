# Retention periods

How long Boardly keeps each kind of personal data, and what deletes it (#1130).
GDPR Art. 5(1)(e): personal data is kept "slik at det ikke er mulig å identifisere de
registrerte i lengre perioder enn det som er nødvendig for formålene" (Lovdata,
personopplysningsloven § 1, ARTIKKEL_5). Every number below lives once, in
`lib/retention-periods.ts` (#1126): the cleanup jobs read it and `/privacy` prints it, so
the notice cannot drift from what gets deleted. `lib/data-retention.ts` adds what each
table rule deletes, and the daily maintenance cron (`app/api/cron/maintenance/route.ts`)
enforces it. Change a period there and here together, and bump `PRIVACY_UPDATED` in
`lib/terms-version.ts`.

## Periods the maintenance cron enforces

| Table | Kept for | Clock starts at | Purpose | Mechanism |
|---|---|---|---|---|
| `Games` | 12 months, then **pseudonymised**, not deleted | end of the game; finished, abandoned and cancelled games only | Game history and statistics shown to the players; afterwards only statistics, the leaderboard and achievements | `lib/data-retention.ts` `games` → `lib/game-pseudonymisation.ts` |
| `Lobbies` (+ `LobbyInvites` by cascade) | 12 months: deleted if no game was played in it, otherwise renamed `Lobby <code>` | creation; inactive lobbies only, and a renamed one only once all its games are pseudonymised | Lobby name, code and creator of the games played in it | `lobbies` |
| `LobbyParticipations` | 24 months | joining the lobby | Pseudonymous join counts (salted hash, no id or name) for year-over-year analytics | `lobbyParticipations` |
| `OperationalEvents` | 180 days | the event | Reliability monitoring and alerting (`site_silent` and the other rules read days, not months) | `operationalEvents` |
| `Feedback` (message, optional email, page URL) | 12 months | submission | Answering and acting on feedback | `feedback` |
| `Reports` (+ `ReportedDrawings` once no report points at one) | 12 months | the report | Handling reports of unlawful or harmful content (#1172); the Discord notification goes with the row | `reports` |
| `Notifications` | 12 months | creation | Notification inbox and delivery de-duplication | `notifications` |
| `AdminAuditLogs` | 24 months | the admin action | Accountability for Control Panel actions | `adminAuditLogs` |
| `GameStateSnapshots` (replays) | 90 days | the snapshot | Game replays | `lib/cleanup-replays.ts`, `REPLAY_RETENTION_DAYS` |
| Unverified accounts | 7 days | sign-up | Email verification | `lib/cleanup-unverified.ts` |
| Inactive registered accounts | 24 months, warning email 30 days before | last activity (`Users.lastActiveAt`) | The account itself | `lib/inactive-accounts.ts`, deleted through `lib/account-deletion.ts` |
| Guest accounts | 3 days idle; 90 days idle for a guest who played | last activity | Playing without an account | `scripts/cleanup-old-guests.ts`, `CLEANUP_GUEST_DAYS` |
| Lobby chat | 24 hours | the message | In-game chat | Redis TTL, `lib/chat-history.ts` |

Counted read-only on production on 2026-09-24, every rule in `lib/data-retention.ts`
matched **0** rows (oldest rows: Games and Lobbies 2026-02-06, Feedback 2026-04-25,
AdminAuditLogs 2026-05-07, OperationalEvents 2026-06-22, Notifications 2026-06-23,
LobbyParticipations 2026-09-04). So every rule is on by default. The first rows to age
out are OperationalEvents around 2026-12-19; Games and Lobbies follow from 2027-02-06.
The `reports` rule was added on 2026-09-27 with its table (#1172), so it too matched
nothing when it shipped and is on by default.

## Games are pseudonymised, not deleted (decision 2026-09-27)

Deleting a year-old game would have taken the player's statistics, the leaderboard and
achievements with it from 2027-02-06. So a finished game past its 12 months keeps its
row and loses what identifies people in it (`lib/game-pseudonymisation.ts`):

- **Replaced:** every player name in `Games.state` (seats, move logs, result rows, an
  Alias team named after its one player) with a seat label, `Player 2`; a bot keeps its
  name. What players wrote or drew is emptied: Spy questions and answers, Sketch & Guess
  drawings and guesses (and which language each player asked a hint in), Liar's Party
  claims, Fake Artist strokes, Telephone Doodle prompts, captions and drawings. Replay
  snapshots are past their own 90 days by then; any that survived are deleted.
- **Kept:** the row, `status`, `gameType`, every timestamp (`updatedAt` is written back
  unchanged, since stats and the speed_demon achievement read it as the end of the
  game), `Players` rows, `terminalMetadata` (user ids and results only) and every id in
  `state`, so `state->'players'` still says who sat where and scored what.
- **Marked:** `Games.pseudonymisedAt`, the rule's once-only marker. At most 500 games a
  run, oldest first; a backlog drains over the following days.
- **Lobbies:** an inactive lobby past 12 months whose games are all pseudonymised gets the
  name the create route gives an unnamed lobby (`Lobby <code>`; `Quick Play <code>`
  stays) and an empty kick list, marked by `Lobbies.pseudonymisedAt`. One that never held
  a game is deleted, as before.

Every reader of old games was checked against that (2026-09-27): profile stats
(`lib/user-stats-dashboard.ts`), the leaderboard (`lib/server/leaderboard.ts`, which reads
`terminalMetadata.playerResults[].userId`), achievements (`lib/achievement-engine.ts`),
the profile game history and results (`/api/user/games`, `/api/game/[gameId]/results`:
names come from the live `Users` row, the state only for the Yahtzee scorecard), the
data export, Discord linked roles and member stats (Players counts), drawing reports
(`lib/server/content-report-targets.ts` answers "nothing to report" for an emptied
drawing), the per-game broadcast sanitizers (a test runs each over a pseudonymised
state), and the Control Panel (`lib/analytics/census.ts` and the games and user pages
read ids from `state->'players'` and join `Bots`/`Users` on them). One Control Panel
effect: its e2e/QA exclusion also matches roster *names* (`E2E…`, `QA …`); 15 games carry
such names, all from before 2026-09-09, which the panel already excludes by date.

Counted read-only on production on 2026-09-27: **0** games and **0** lobbies past the
cutoff (oldest terminal game ended 2026-02-06 08:34 UTC), so the first pseudonymisation
runs on 2027-02-07.

## Inactive accounts (decision 2026-09-27)

A registered account nobody has used for 24 months is deleted (`lib/inactive-accounts.ts`,
from the maintenance cron). Its owner gets a warning email 30 days before, in English and
Norwegian (`sendInactiveAccountWarningEmail`), and signing in once keeps the account:
`lastActiveAt` is written on every sign-in (`events.signIn` in `lib/next-auth.ts`) and at
most every five minutes while a session is used.

- **Never deleted by this rule:** guests (their own rule), bots, admins (they work in the
  Control Panel, which does not write `lastActiveAt`), an account without an email address
  (it cannot be warned), and any account that is or ever was a customer: a subscription,
  paid time left, a Stripe customer, a `PurchaseConsents` row or `premiumFirstGrantedAt`
  (`neverCustomerWhere`, shared with the unverified-account purge).
- **Idempotent:** the warning is claimed by moving `Users.inactivityWarningSentAt` with a
  compare-and-set and released if the email fails, like the subscription notice. Deletion
  needs a warning sent after the last activity and at least 30 days old, and the delete is
  guarded on `lastActiveAt` and the warning being what the run read.
- **Same path as a deletion the owner asks for** (`lib/account-deletion.ts`): avatar,
  Stripe subscription and customer, Discord linked roles, the name in other players' games
  and replays, feedback detached, ids only in the logs.

Counted read-only on production on 2026-09-27: **0** accounts due a warning and **0** due
deletion, of 138 registered humans; the oldest `lastActiveAt` is 2025-12-18 18:21 UTC, so
with the cron at 03:00 UTC the first warning can go out on 2027-11-19 and the first
deletion follow on 2027-12-19, at the earliest.

A reported chat message outlives the 24-hour chat TTL on purpose: the report keeps a
copy of it for the report's own 12 months. When the author's account is deleted, the
report loses its link to the account (`ON DELETE SET NULL`) and keeps the copy.

### Report mode and `RETENTION_ENFORCE`

Each rule has `enforceByDefault`. A new rule that would delete or rewrite rows that exist
today ships with it `false`: it only counts, and the count lands in the `cron_run`
heartbeat payload as `retention_<rule>_matched` (enforced rules write
`retention_<rule>_deleted`, and `games` and `lobbies` also `retention_<rule>_pseudonymised`).
The inactive-account rule writes `inactive_accounts_warned` / `_deleted` (and `_warn_failed`
/ `_delete_failed`), or in report mode `inactive_accounts_warn_due` / `_delete_due`.
`RETENTION_ENFORCE=false` switches the whole run to report mode, the inactive-account rule
included; `RETENTION_ENFORCE=true` enforces every rule; unset, each rule follows its own
default.

## Kept for the life of the account

Deleted with the account (the rows cascade from `Users`), and the account itself stays
until its owner deletes it (`/api/user/request-deletion` → `/api/user/delete-account`) or
the inactivity rule above does:

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
the reports the user filed (what, why and when; not the other player or the copy of their
content), achievements and push subscriptions (without their keys). The profile page's Account tab
has the button. A guest, or a request covering data the export does not include
(`AdminAuditLogs` about the user, `OperationalEvents`), is handled by email to
support@boardly.online within one month (GDPR Art. 12(3)).
