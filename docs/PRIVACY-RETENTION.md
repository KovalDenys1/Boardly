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
| `Lobbies` (+ `LobbyInvites` by cascade) | 12 months: deleted with its games if every game in it was cancelled (none ever started); otherwise renamed `Lobby <old code>` and its code retired to `~<id>` | creation; inactive lobbies only, and a renamed one only once all its games are pseudonymised | Lobby name, code and creator of the games played in it | `lobbies` |
| `LobbyParticipations` | 24 months | joining the lobby | Pseudonymous join counts (salted hash, no id or name) for year-over-year analytics | `lobbyParticipations` |
| `OperationalEvents` | 180 days | the event | Reliability monitoring and alerting (`site_silent` and the other rules read days, not months) | `operationalEvents` |
| `Feedback` (message, optional email, page URL) | 12 months | submission | Answering and acting on feedback | `feedback` |
| `Reports` (+ `ReportedDrawings` once no report points at one) | 12 months | the report | Handling reports of unlawful or harmful content (#1172); the Discord notification goes with the row | `reports` |
| `Notifications` | 12 months | creation | Notification inbox and delivery de-duplication | `notifications` |
| `AdminAuditLogs` | 24 months | the admin action | Accountability for Control Panel actions | `adminAuditLogs` |
| `GameStateSnapshots` (replays) | 90 days | the snapshot | Game replays | `lib/cleanup-replays.ts`, `REPLAY_RETENTION_DAYS` |
| Unverified accounts | 7 days | sign-up | Email verification | `lib/cleanup-unverified.ts` |
| Inactive registered accounts | **Not enforced yet**: 24 months with a warning email 30 days before, in the Terms from 2027-01-01, switched off until the notice has gone out | last activity (`Users.lastActiveAt`) | The account itself | `lib/inactive-accounts.ts` (`TERMS_ALLOW_INACTIVITY_DELETION = false`), deleting through `lib/account-deletion.ts` |
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
  run, in id order; a backlog drains over the following days. A game whose state cannot
  be read as a JSON object is skipped, logged by id and left unmarked (it may still hold
  names), so every run reads it again; production had none on 2026-09-27.
- **Lobbies:** every lobby is created with a game, so "a lobby with no game" does not
  happen. At 12 months after creation an inactive lobby whose games were **all cancelled**
  (cancelled means it never started: 664 cancelled games on 2026-09-27, none with a
  `startedAt`) is deleted, and those games, their `Players` rows and snapshots go with it
  by cascade. An inactive lobby that held a real game is kept for its games' statistics;
  once every game in it is pseudonymised it gets the name the create route gives an
  unnamed lobby, built from the old code (`Lobby 4821`; `Quick Play 4821` stays), an empty
  kick list and a retired code, `~<lobby id>`, which frees the four-digit code for new
  lobbies. `Lobbies.pseudonymisedAt` marks it. `/api/user/games` and the results route hand
  back no code for a retired lobby, so the history shows none.
- **What deleting cancelled games changes:** a cancelled game counts in the profile's
  total of games (`lib/user-stats-dashboard.ts` counts finished, abandoned and cancelled)
  but never as a win, loss or draw, and in no leaderboard or achievement query that needs
  a result. So a host's "total games" loses the never-started lobbies older than 12
  months; achievements already granted stay. Of the 664 cancelled games, 223 still have a
  `Players` row and 3 had a second human in the waiting room before it was cancelled.

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

Counted read-only on production on 2026-09-27: **0** games past the cutoff (oldest
terminal game ended 2026-02-06 08:34 UTC), **0** lobbies to delete and **0** to rename
(oldest lobby created 2026-02-06 08:33 UTC), so nothing is touched before 2027-02-07. By
shape, ignoring age: 566 lobbies hold only cancelled games, 1,364 held a real game, none
has no game, none inactive still holds a waiting or playing game, and no lobby code starts
with `~`.

## Inactive accounts (decision 2026-09-27): in the Terms, not enforced yet

A registered account nobody has used for 24 months is deleted, after a warning email 30
days before. Terms section 2 says so since the version of 2026-10-05, for the time from
`INACTIVITY_RULE_STARTS` (2027-01-01, `lib/terms-version.ts`); section 10 already excepts
"the deletions described in section 2". The privacy notice states the same rule with the
same date, and a test fails if any locale states it without the date.

Three steps are left, in this order:

1. **The section 11 email.** Terms section 11 owes every account holder an email at least
   30 days before the change applies. `lib/terms-change-notice.ts` sends it from the
   maintenance cron, 20 a night (Resend allows 100 emails a day), to every registered
   account with a verified address created by the end of 2026-10-05, and writes
   `Users.termsNoticeVersion` and `termsNoticeSentAt` once Resend has accepted each one.
   It is switched off by `TERMS_CHANGE_NOTICE_SEND = false` until the text is approved;
   until then it only counts, as `terms_notice_due` in the `cron_run` heartbeat. It refuses
   to send after 2026-12-02, when 30 days of notice can no longer be given: the date in
   the Terms then has to move, which is a new Terms version.
2. **The start date.** `lib/inactive-accounts.ts` does nothing before
   `INACTIVITY_RULE_STARTS`, whatever its constant says.
3. **The constant.** `TERMS_ALLOW_INACTIVITY_DELETION` goes to true only after
   `terms_notice_due` has been 0 since 2026-12-02 at the latest. While it is false the
   rule sends no warning and deletes nothing, whatever `RETENTION_ENFORCE` says, and only
   counts. Counted on production on 2026-09-27, the first warning falls on 2027-11-19 at
   the earliest, so the constant has until then.

What the rule does once it is on:

- **Activity** is `Users.lastActiveAt`, written on every sign-in (`events.signIn` in
  `lib/next-auth.ts`, added with this rule) and at most every five minutes while a session
  is used, so signing in once keeps the account. The warning, in English and Norwegian
  (`sendInactiveAccountWarningEmail`), says so.
- **Never deleted by this rule:** guests (their own rule), bots, admins (they work in the
  Control Panel, which does not write `lastActiveAt`), suspended accounts, an account
  without an email address (it cannot be warned), and any account that is or ever was a
  customer: a subscription, paid time left, a Stripe customer, a `PurchaseConsents` row or
  `premiumFirstGrantedAt` (`neverCustomerWhere`, shared with the unverified-account purge).
- **Two markers.** `inactivityWarningSentAt` is the claim, moved with a compare-and-set
  before the send and released if Resend refuses; a claim a day old with nothing delivered
  is taken again. `inactivityWarningDeliveredAt` is written only after Resend accepts, and
  deletion requires it (later than the last activity, at least 30 days old). A run that
  dies between claim and send therefore delays a warning; it never leads to an unwarned
  deletion. At most 10 warnings a run, to spare Resend's daily budget.
- **Same path as a deletion the owner asks for** (`lib/account-deletion.ts`): avatar,
  Discord linked roles, the name in other players' games and replays, feedback detached,
  tokens and friendships, ids only in the logs (Stripe too, though the rule never selects a
  customer). The account is re-checked against the rule when it is read and again in the
  final delete statement. A sign-in in the seconds between those two keeps the row but not
  what the deletion had already removed.

Counted read-only on production on 2026-09-27: of 138 registered humans (not a guest, not
a bot; 1 of them an admin), 134 fall under the rule at all (the rest are admins or
customers), **0** are past 700 days without activity
(due a warning) and **0** past 730 days (due deletion); none is suspended; the oldest
`lastActiveAt` is 2025-12-18 18:21 UTC.

A reported chat message outlives the 24-hour chat TTL on purpose: the report keeps a
copy of it for the report's own 12 months. When the author's account is deleted, the
report loses its link to the account (`ON DELETE SET NULL`) and keeps the copy.

### Report mode and `RETENTION_ENFORCE`

Each rule has `enforceByDefault`. A new rule that would delete or rewrite rows that exist
today ships with it `false`: it only counts, and the count lands in the `cron_run`
heartbeat payload as `retention_<rule>_matched` (enforced rules write
`retention_<rule>_deleted`, and `games` and `lobbies` also `retention_<rule>_pseudonymised`).
The inactive-account rule writes `inactive_accounts_warned` / `_deleted` (and `_warn_failed`
/ `_delete_failed`) when it acts, and otherwise `inactive_accounts_enforced: false`,
`inactive_accounts_terms_allow` and the counts `inactive_accounts_warn_due` /
`_delete_due`. `RETENTION_ENFORCE=false` switches the whole run to report mode, the
inactive-account rule included; `RETENTION_ENFORCE=true` enforces every table rule but
cannot switch the inactive-account rule on past the Terms gate; unset, each rule follows
its own default.

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
the reports the user filed (what, why and when; not the other player or the copy of their
content), achievements and push subscriptions (without their keys). The profile page's Account tab
has the button. A guest, or a request covering data the export does not include
(`AdminAuditLogs` about the user, `OperationalEvents`), is handled by email to
support@boardly.online within one month (GDPR Art. 12(3)).
