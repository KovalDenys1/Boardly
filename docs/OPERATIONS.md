# Operations

## Local development

For a full local-only walkthrough without hosted services, start with `docs/LOCAL_SETUP.md`.

### Prerequisites

- Node.js 20.19+ (required by Prisma 7)
- PostgreSQL/Supabase
- npm

### Setup

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:push
npm run dev
```

## Machine bootstrap and sync

### New machine bootstrap

```bash
git clone <repo-url>
cd Boardly
npm install
cp .env.example .env.local
npm run db:generate
npm run db:push
npm run dev
```

### Daily sync workflow

```bash
git pull
npm install
npm run db:generate
npm run dev
```

Before pushing changes:

```bash
npm run lint
npm test
npm run build
```

## Environment file strategy

Use one primary file for local development: `.env.local`.

Notes:

- Next.js automatically loads `.env.local`.
- Keep `.env` optional (for local overrides only), not mandatory.

## Required env vars (minimum)

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `CORS_ORIGIN`

Recommended:

- `DIRECT_URL` (for migrations)
- `GUEST_JWT_SECRET` (guest token signing isolation)
- `CRON_SECRET` (required in production; recommended locally to test `/api/cron/*`)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase project credentials for Realtime)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side Supabase client for `broadcastToLobby`)
- `MCP_POSTGRES_CA_CERT_PATH` (optional CA bundle path for hosted/TLS PostgreSQL used by Prisma 7 adapter and MCP scripts; not needed for local localhost PostgreSQL)
- hosted `DATABASE_URL` note: if your provider ships `sslmode=require` without a CA bundle, Boardly now enables libpq-compatible TLS semantics at runtime unless `MCP_POSTGRES_CA_CERT_PATH` is configured for strict `verify-full`
- `BOT_UX_DELAY_MS` or `BOT_UX_DELAY_SCALE` + `BOT_UX_DELAY_MIN_MS` + `BOT_UX_DELAY_MAX_MS` (optional bot UX timing controls). They can only make a bot **faster or equal**, never slower than the pace its executor codes for: `resolveBotUxDelayMs` caps its own result at `botUxDelayUpperBoundMs(base)`. The client's bot-turn recovery grace is derived from that same bound and runs in a browser, where these server-only variables are invisible, so a setting that outran it would put a 409 on every bot turn (#1049)
- `OPS_ALERT_WEBHOOK_URL` (Discord webhook for reliability alerts; the payload is a Discord embed, not a Slack one)
- `FEEDBACK_DISCORD_WEBHOOK_URL` (optional Discord webhook that mirrors `/api/feedback` submissions into the staff feedback channel)
- `NEXT_PUBLIC_DISCORD_INVITE` (optional; the invite `/discord` redirects to, inlined at build time, falling back to the invite compiled into `lib/discord.ts`)
- `DISCORD_APPLICATION_ID` (optional; Linked Roles push) and `DISCORD_INTERNAL_SECRET` (optional; bearer for `/api/internal/discord/*`, same value in the Pi env file)
- the full Discord map, including the bot's own variables, is `docs/DISCORD.md`
- `OPS_ALERT_WINDOW_MINUTES`, `OPS_ALERT_BASELINE_DAYS`, `OPS_ALERT_REPEAT_MINUTES`
- `OPS_RUNBOOK_BASE_URL` (optional absolute runbook links in alert payloads)
- `GITHUB_ALERT_TOKEN` / `GITHUB_ALERT_REPO` (optional GitHub issue creation/closure for reliability alerts; repo format is `owner/repo`)
- `CLEANUP_GUEST_DAYS` (optional retention window for guests who never played a game, defaults to `3`; guests who did play - any game that reached `playing`, `finished` or `abandoned` - are kept for 90 days of inactivity, or for `CLEANUP_GUEST_DAYS` when that is set higher, whichever is longer)
- `REPLAY_RETENTION_DAYS` (optional replay retention window for finished/abandoned/cancelled games, defaults to `90`)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (optional shared rate-limit backend for production; when absent, app falls back to in-memory limiter)
- GitHub Actions scheduler configuration:
- `RELIABILITY_ALERTS_CRON_URL` (for example `https://boardly.online/api/cron/reliability-alerts`)
- `CRON_SECRET` (must match the app env value used by the endpoint)
- `PROJECT_HYGIENE_TOKEN` (PAT used by `.github/workflows/project-hygiene.yml`; needs read/write access to project items plus issue/PR read access)
- repo variable `PROJECT_HYGIENE_PROJECT_NUMBER` (target GitHub Project v2 number, for example `1`)
- optional repo variable `PROJECT_HYGIENE_OWNER` (user/org login; defaults to repository owner)

## Secret migration notes

Canonical secrets only:

- `NEXTAUTH_SECRET`
- `CRON_SECRET`

Migration from deprecated aliases:

1. Remove `JWT_SECRET` from all app environments.
2. Ensure `NEXTAUTH_SECRET` is set and has at least 32 characters.
3. Ensure `CRON_SECRET` is set and scheduler jobs send `Authorization: Bearer ${CRON_SECRET}`.
4. Do not use `NEXTAUTH_SECRET` for cron endpoint authorization.
5. Redeploy the Next.js app and verify `/api/cron/*` auth still succeeds.

Note: `SOCKET_SERVER_INTERNAL_SECRET`, `NEXT_PUBLIC_SOCKET_URL`, and `SOCKET_SERVER_URL` are decommissioned — remove them from all environments after the Supabase Realtime migration.

## Build and deploy

### Frontend

- Platform: Vercel
- Command: `npm run build`

### Migrations

- Run from `.github/workflows/migrate.yml` when `prisma/migrations/**` or
  `prisma/schema.prisma` changes on `develop`, never from the Vercel build –
  `prisma migrate deploy` hangs cross-region there.
- A merge to `develop` therefore puts the schema on production while the code is still on
  `main`. Check `git log origin/main..origin/develop` before calling a feature live.

## Production runbook

1. Deploy schema changes from the migration workflow (or `npm run db:migrate` by hand).
2. Deploy the Next.js app.
3. Verify the health endpoint (`/api/health`) and the lobby join flow.
4. Verify the alert scheduler (Vercel Cron, declared in `vercel.json`), the endpoint (`/api/cron/reliability-alerts`), and webhook delivery.
5. Check the SLO rules in `docs/REALTIME_TELEMETRY.md` against recent `OperationalEvents`.

Note: `npm run db:migrate` automatically bootstraps required RLS roles
(`anon`, `authenticated`, `service_role`) before running `prisma migrate deploy`,
so CI/local PostgreSQL environments do not require a separate manual role-prep step.

### Storage: the `avatars` bucket

Checked and locked down on 2026-09-24 (security audit, part A). The bucket is **public for reads**
(avatar URLs are served straight from Supabase) and **written only by the server** through
`lib/supabase-storage.ts` with `SUPABASE_SERVICE_ROLE_KEY`; the service role bypasses RLS, so no
storage policy is needed for the app to work, and **no policy on `storage.objects` may name `anon` or
`authenticated`**. Two such policies had been created by hand in the console (anon INSERT and UPDATE on
the bucket) and were dropped on 2026-09-24. The bucket itself enforces what the upload route also
checks: `file_size_limit = 2097152` and `allowed_mime_types = {image/jpeg,image/png,image/webp,image/gif}`.

This configuration lives in the console, not in a Prisma migration (the `storage` schema does not
exist in local or CI Postgres), so `scripts/rls-smoke.psql` asserts it whenever the schema is present.
To verify by hand, on either project:

```sql
select policyname, roles from pg_policies where schemaname = 'storage' and tablename = 'objects';
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';
```

Expected: no row with `anon` or `authenticated` in `roles`; the limits above. From outside, a `POST` to
the Supabase storage endpoint (`https://<project>.supabase.co` + the storage object path for the
`avatars` bucket) with the public anon key answers `403 AccessDenied`.
The dev project (`inmvbxfflqeblynpktay`) got the same bucket with the same limits on 2026-09-24.

### Timestamp migration rollout notes (`timestamptz` phases)

When migrating existing timestamp columns from `TIMESTAMP` to `TIMESTAMPTZ`:

- batch by table/domain (do not convert unrelated tables in one release)
- deploy schema migration first, then application changes if parsing/serialization logic changes
- verify cron/scheduler paths and realtime timer logic after deploy (timestamp-sensitive flows)
- check for DB locks/statement timeout risk on large tables before running DDL in production
- validate API payloads still emit ISO timestamps and UI date rendering remains correct

Recommended verification after each phase:

- `npm run check:db`
- `npm run db:audit`
- `npm run db:rls:smoke`
- critical cron/manual endpoint smoke (`/api/cron/*` used in that phase)
- one realtime gameplay flow (create/join/play/reconnect) if gameplay timestamps changed

## Common troubleshooting

### Postgres connection fails with `self-signed certificate in certificate chain`

For hosted PostgreSQL with a custom CA chain, export the CA bundle and write its path into `MCP_POSTGRES_CA_CERT_PATH` in your env file.

Runtime note:

- Prisma 7 / `pg-connection-string` may treat `sslmode=require` more strictly than older libpq-style clients.
- Boardly normalizes hosted runtime URLs with `sslmode=require|prefer|verify-ca` to libpq-compatible behavior when no CA bundle is configured.
- If you want strict certificate verification, configure `MCP_POSTGRES_CA_CERT_PATH` so runtime uses `sslmode=verify-full`.

### Realtime not working locally

The `supabase_realtime` publication is console state, not a migration: it must contain `Lobbies` (and
`Games`, `Players`, as production does) or Postgres Changes subscriptions join with `SUBSCRIBED` and
never receive anything, with `realtime.subscription` staying empty. `boardly-dev` was aligned with
production on 2026-09-24. Check with `select * from pg_publication_tables where pubname = 'supabase_realtime'`.
Since the same day the API roles hold only a column-limited `SELECT` on `Lobbies` (migration
`20260924141000_revoke_anon_authenticated_grants`); Realtime delivers exactly those columns to `anon`
subscribers, which is what the lobby list needs, and `scripts/rls-smoke.psql` asserts the grants after
every production migration (`migrate.yml`).

Check:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly in `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` is set (required for server-side `broadcastToLobby`)
- `CORS_ORIGIN` includes your frontend origin

### Guest requests unauthorized

Check:

- client sends `X-Guest-Token`
- token is created through `/api/auth/guest-session`
- `NEXTAUTH_SECRET` or `GUEST_JWT_SECRET` is configured

### CSRF blocks authenticated API writes

Symptoms:

- `403` response with `Invalid origin. Possible CSRF attack.` on `POST/PUT/PATCH/DELETE` to `/api/*`

Check:

- frontend request is same-origin (or origin is explicitly allowed)
- browser sends expected `Origin` or `Referer` headers
- deployment origin / `CORS_ORIGIN` / `ALLOWED_ORIGINS` values are correct

### Reconnect reliability regressed

Check:

- reconnect telemetry and SLO cards in `docs/REALTIME_TELEMETRY.md`
- spike in `socket_reconnect_failed_final` by `reason`
- spike in `socket_auth_refresh_failed` by `stage` or `status`
- increase in `lobby_join_ack_timeout` after deploys

### Alerts not firing

Check:

- `OPS_ALERT_WEBHOOK_URL` is configured as a Discord webhook and valid
- if GitHub issue automation is enabled, `GITHUB_ALERT_TOKEN` and `GITHUB_ALERT_REPO` are configured
- cron auth header includes `Bearer ${CRON_SECRET}` for `/api/cron/reliability-alerts` (no `NEXTAUTH_SECRET` fallback)
- `CRON_SECRET` is set in Vercel Production — Vercel sends it as the `Authorization: Bearer` header on every scheduled invocation, which is what `authorizeCronRequest` checks
- `OperationalEvents` contains recent `rejoin_timeout` / `auth_refresh_failed` / `move_apply_timeout`
- run manual dry-run: `npm run ops:alerts:check -- --dry-run`

### Runbook: discord_bot_stale

The Discord bot on the Raspberry Pi (`KovalDenys1/boardly-discord`, see `docs/DISCORD.md`) posts
`POST /api/internal/discord/heartbeat` every 5 minutes. The route writes a `cron_run` row with
`source = "discord-bot"`; the rule reads the newest one. Warning after 20 minutes of silence,
critical after 60. A bot that has never posted does not alert – the launch checklist proves the
first heartbeat by hand.

When it fires:

1. Is the Pi up? `ssh` in, `systemctl status boardly-discord`, `journalctl -u boardly-discord -n 100`.
   A `Restart=always` loop with a 401 in the log means the token or `DISCORD_INTERNAL_SECRET` on the
   Pi no longer matches – the site answers 401 on a wrong secret and 503 when it is unset on Vercel.
2. Is the bot up but the heartbeat failing? `curl -s http://127.0.0.1:3310/health` on the Pi should
   report `ready: true`; then check `BOARDLY_BASE_URL` in `/home/denys/.boardly-discord.env`.
3. Is the site rejecting it? Vercel logs for `/api/internal/discord/heartbeat` – 429 means a restart
   loop is hammering the route (12 per minute allowed), 503 means the secret is missing in Production.
4. Nothing wrong anywhere? Check `OperationalEvents` for the newest `cron_run` with
   `source = 'discord-bot'`; if rows are arriving, the alert resolves on the next cycle.

The alert resolves itself once a heartbeat lands; the GitHub issue closes with it.

### Runbook: site_silent

The dead-man's switch. Every other reliability rule counts something going *wrong*, so all of them
read healthy when nothing happens at all – which is how 19–20 September 2026 passed unnoticed: the
site served 36 visitors over two days and recorded no lobby, no game, no move and no invite, while
`reliability-alerts` ran every ten minutes and reported nothing.

This rule fires on absence. It counts the events a human has to be present to produce
(`HUMAN_ACTIVITY_EVENT_NAMES`: lobby created, move applied, invite opened, second human joined,
signup prompt shown) over the trailing 18 hours, and compares them against the *same hours* on each
of the preceding days, summarised by their 75th percentile. It breaches when the current window is
exactly zero and that baseline is at least 5.

Why those numbers, all measured against September 2026 traffic and not chosen by feel:

- **18-hour window.** Boardly is quiet enough that a 6-hour window cannot tell an outage from a
  lull: replayed over the 168 healthy hours of 12–18 September it would have cried on 23 of them.
  18 hours cried once. The cost is detection speed – on 19 September a 6-hour window fires at 08:00
  UTC, this fires at 18:00. An alert that is wrong once a fortnight gets muted, and a muted alert is
  what this rule exists to prevent.
- **Same hours, not a flat rate.** 04:00 is genuinely empty; comparing it to a daytime average
  would alert every night.
- **75th percentile, not a median or a mean.** The baseline has to survive the outage it describes.
  A mean gives up on day two, a median on day four – at which point the rule stops breaching and
  posts a recovery that never happened.

When it fires:

1. **Is the site actually serving?** Load `https://boardly.online/` and `/lobby/create`, with the
   browser console open. Both pages rendering with no console error means the fault is deeper than
   the shell – keep going.
2. **Walk the funnel as a stranger.** A private window, no session: create a lobby, copy the invite,
   open it in a second private window, make one move. Do it on a phone viewport too – a break that
   only hits mobile is invisible from a desktop check, and most arrivals are mobile.
3. **Did the writes land?** `Users` (a fresh `isGuest` row), `Lobbies`, `Games`, and
   `OperationalEvents` for the events step 2 should have produced. Writes failing while pages render
   points at the API, not the front end.
4. **Is it only the telemetry?** If lobbies and games *are* being created but the human events are
   missing, the fault is `/api/ops/events` or the client emitter, not the product. The site is fine;
   fix the instrument.
5. **What shipped?** `git log --first-parent origin/main` around the last healthy hour. Correlate
   against the hour human events stopped:
   `select date_trunc('hour', "occurredAt"), count(*) from "OperationalEvents"
    where "eventName" <> 'cron_run' group by 1 order by 1 desc limit 48;`
6. **Nothing shipped and everything works?** Then arrivals themselves fell. Check Vercel Analytics
   visitors and Bing Webmaster clicks for the same days before touching any code – and note that
   Bing's Total Clicks includes Copilot and chat verticals, which are not necessarily site visits.

The alert resolves itself on the first human event; the GitHub issue closes with it.

### CSP hardening verification (preview/production)

Check response headers for representative routes (for example `/games`, `/lobby`, `/auth/login`):

- `Content-Security-Policy` `script-src` includes `'self'` and trusted script origins
- `Content-Security-Policy` `script-src` includes `'unsafe-inline'` (required by current Next.js App Router bootstrap output)
- `Content-Security-Policy` does not include `'unsafe-eval'` in `script-src`

Example:

```bash
curl -I https://boardly.online/games | grep -i content-security-policy
```

### Replay storage grows over time

Check:

- daily maintenance endpoint (`/api/cron/maintenance`) is running with valid `CRON_SECRET`
- `REPLAY_RETENTION_DAYS` is configured as expected (or default `90`)
- run manual cleanup to verify behavior:
  - `npm run cleanup:old-replays -- --days=90`

## Reliability operations commands

```bash
# Evaluate alert rules and send notifications (if webhook is configured)
npm run ops:alerts:check

# Run load scenario and produce fail-rate report
npm run ops:load -- --iterations=80 --concurrency=12 --game-type=tic_tac_toe --report-path=reports/ops-load.json
```

## Project board hygiene automation

Workflow: `.github/workflows/project-hygiene.yml`

- Schedule: hourly (`0 * * * *`)
- Manual run: GitHub Actions `workflow_dispatch`
- Dry run: set `dry_run=true` in manual dispatch inputs

Workflow: `.github/workflows/project-auto-add.yml`

- Trigger: immediately on `issues.opened/reopened` and `pull_request.opened/reopened`
- Action: adds new issue/PR cards to the configured Project v2
- Owner resolution: tries `PROJECT_HYGIENE_OWNER` as user first, then as organization

Required configuration (for both workflows):

- GitHub Secret: `PROJECT_HYGIENE_TOKEN`
- Repository Variable: `PROJECT_HYGIENE_PROJECT_NUMBER`
- Optional Repository Variable: `PROJECT_HYGIENE_OWNER` (defaults to `github.repository_owner`)

Local/manual execution examples:

```bash
# Dry run with explicit owner/project
npm run ops:project-hygiene -- --dry-run --owner=KovalDenys1 --project=1

# Mutating run via env config
PROJECT_HYGIENE_OWNER=KovalDenys1 \
PROJECT_HYGIENE_PROJECT_NUMBER=1 \
PROJECT_HYGIENE_TOKEN=<token> \
npm run ops:project-hygiene
```

Token scope notes for `PROJECT_HYGIENE_TOKEN`:

- Fine-grained PAT: read access to Issues and Pull requests, plus write access to Projects for the target owner project.
- Classic PAT fallback: include `repo` and `project`.

## UX/performance sweep closeout (`#131`)

Use this checklist to close the UX/performance epic after ticket branches are merged to `develop`.

### Execution order, outcomes, and owner

| Ticket | Dependency order | Expected outcome | Owner |
| --- | --- | --- | --- |
| `#127` | 1 | Perceived move registration latency is reduced with optimistic feedback and safe reconcile paths. | Ticket author / assignee |
| `#128` | 2 | Bot handoff delay is short, predictable, and configurable without race-condition regressions. | Ticket author / assignee |
| `#129` | 3 | Leave flow redirects to `/games` quickly with bounded fallback and cleanup integrity. | Ticket author / assignee |
| `#130` | 4 | Terminal lifecycle states (`finished/abandoned/cancelled`) resolve to deterministic UI/redirect paths. | Ticket author / assignee |
| `#126` | 5 | Mobile/tablet layout overflows are removed across core lobby/game/profile routes. | Ticket author / assignee |

### Final regression pass (epic gate)

Run from an up-to-date local `develop`:

```bash
git checkout develop
git pull --ff-only origin develop
npm install
npm run ci:quick
npm test -- --runTestsByPath \
  __tests__/app/useLobbyRouteState.test.ts \
  __tests__/app/lobby-page-fallbacks.test.tsx \
  __tests__/api/game-state.test.ts \
  __tests__/api/lobby-code.test.ts \
  __tests__/lib/lobby-snapshot.test.ts \
  __tests__/lib/bots/tic-tac-toe-bot.test.ts \
  __tests__/lib/bots/rock-paper-scissors-bot.test.ts \
  __tests__/lib/bots/bot-ux-timing.test.ts \
  __tests__/api/lobby-leave.test.ts \
  __tests__/api/lobby-realtime-topic.test.ts \
  __tests__/lib/lobby-lifecycle.test.ts
```

Manual smoke matrix (required):

- Desktop: create -> join -> start -> play -> reconnect -> leave -> finish.
- Mobile phone viewport: lobby + game playability, no horizontal overflow, CTA visibility.
- Tablet viewport: lobby + game playability, no clipped controls or wrapped action bars.

Closeout note in issue `#131` should include:

- linked PRs for `#126-#130`
- automated regression command results
- manual smoke result summary (desktop/mobile/tablet)
