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
- `GUEST_JWT_SECRET` (guest token signing isolation) and `PARTICIPATION_HASH_SALT` (participation hash); both required in production, see "Moving guest tokens and the participation hash off `NEXTAUTH_SECRET`" below
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

Operator imprint (#1163): `NEXT_PUBLIC_SELLER_LEGAL_NAME` and `NEXT_PUBLIC_SELLER_ADDRESS` hold the
name and geographic address of whoever operates Boardly, which ehandelsloven section 8,
angrerettloven section 8 d and GDPR Art. 13(1)(a) require on the site. They are public values
by law (hence the prefix, so the client-side footer can read them) but personal ones, so they are
set in Vercel's Production environment only and never committed; address lines are separated by
`|`. With both set, the footer shows "Operated by <name>", the address and the support email on
every page, the Terms of Service page opens with a "Who we are" section naming the seller of
Boardly Premium, the Privacy Policy page opens with "Who is responsible for your data", and every
email ends with the same name, address and email. With either unset, all four render nothing,
and `npm run check:env` warns when that is the case in production.

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

### Moving guest tokens and the participation hash off `NEXTAUTH_SECRET` (#1142, #1149)

`GUEST_JWT_SECRET` and `PARTICIPATION_HASH_SALT` fall back to `NEXTAUTH_SECRET`. Until
**2026-12-27** (`NEXTAUTH_SECRET_FALLBACK_CUTOFF` in `lib/nextauth-secret-transition.ts`) the
code still *reads* with `NEXTAUTH_SECRET` once the dedicated values are set: a guest token that
fails `GUEST_JWT_SECRET` is tried against it, and a lobby join is deduplicated against the
old-salt participant key as well as the new one. Everything new is signed and hashed with the
dedicated values. From the cutoff on only the dedicated values are accepted.

Order, once the release carrying that code is live on production:

1. `GUEST_JWT_SECRET` in Vercel **Production**: a new random value of at least 32 characters,
   different from `NEXTAUTH_SECRET`.
2. `PARTICIPATION_HASH_SALT` in Vercel **Production**: another new random value of at least 32
   characters, different from both.
3. Redeploy production, so the functions read them. `npm run check:env` then stops reporting
   either as missing.
4. Remove the five variables nothing reads (#1149; plain text here because no code declares
   them any more): ENABLE_LIARS_PARTY, ENABLE_ALIAS, STRIPE_PUBLISHABLE_KEY,
   SUPABASE_JWT_SECRET, SUPABASE_SECRET_KEY.

Setting them while production still runs the older code is exactly the breaking switch this
transition exists to avoid - it would sign and verify with the new values and accept nothing
older - so check `git log origin/main` for this change first. Setting them late costs less:
guests whose identity token was issued on the old secret after 2026-09-28 lose it at the cutoff
and come back as new guests; nothing else breaks. Never change either value once set - that
would need a transition window of its own.

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

### Runbook: withdrawal request (angrerett)

A consumer may withdraw from a Premium purchase within 14 days of buying it, for any reason. Policy
(Denys, 2026-09-24): full refund of everything paid for that purchase, no proportionate charge; a yearly
plan cancelled later refunds the unused whole months. Legal basis and sources: the vault's
Security & Law Audit 2026-09, Part E.

**Since #1179 Premium is sold through Stripe Managed Payments.** Stripe's affiliate Sold through Link,
LLC is the merchant of record: the buyer's receipt, invoice and refund notice come from Link, and the
card statement reads `LINK.COM* <descriptor>`. What that changes here, from
https://docs.stripe.com/payments/managed-payments/how-it-works.md and the Stripe Managed Payments
Terms (https://stripe.com/legal/managed-payments, sections 3.3 and 3.4):

- **We still refund from our own Dashboard.** "You can still respond directly to customers, issue
  refunds, update subscriptions, and handle product-related issues yourself." Link emails the buyer the
  refund notice; we send no receipt of our own.
- **A refund can also arrive without us.** Buyers can ask Link support
  (https://support.link.com/topics/sold-through-link), and Link's terms give EU and UK consumers a
  14-day "cooling off period" handled there. SMP "reserves the right to issue refunds within 60 days"
  of purchase, and the Dashboard's refund-request setting is "Refund without emailing me" (Denys,
  2026-09-24), so such a refund shows up in the Dashboard already made. If Stripe does ask us about a
  request, answer within 48 hours or it "may refund the payment to the Customer without User's input".
- **Tax on a refund.** The buyer gets the full amount back, tax included, but "in certain jurisdictions"
  Stripe keeps remitting the original tax and our balance is reduced by it.
- **Link does not refund unused subscription periods** ("Unless required by Law, we do not provide
  refunds for unused subscription periods"), so the yearly plan's unused-months refund below is always
  ours to issue.

1. A notice arrives by email to support@ (forwarded by the inbound webhook) or as the copied form from
   the withdrawal page. The same day, reply from support@ confirming receipt and the date it was received
   (angrerettloven § 20 tredje ledd). Company voice, "The Boardly team".
2. In the Stripe Dashboard: cancel the subscription immediately (not at period end), then refund the
   payment in full from the payment's page. Stripe returns the customer's local amount at the original
   rate (Link's terms: "the same Applicable Exchange Rate will apply to the refund"). Do this within 14
   days of the notice (§ 24); in practice the same day. First check the payment's page for a refund Link
   has already made, so the buyer is not refunded twice.
3. Premium access ends when the webhook processes the cancellation; if the customer asks, confirm by
   email that nothing more will be charged.
4. Log the case in the vault's Boardly log (date received, date refunded, Stripe refund id, no personal
   data beyond the username).

**A refund Link made on its own** (a Premium payment in the Dashboard shows a refund nobody here issued):
check the subscription. Link's pages do not say whether its refund also cancels the subscription. If the
whole payment was refunded and the subscription is still active, cancel it immediately so the next
renewal does not charge a buyer who withdrew. Log it like step 4, noting that Link made the refund.

Yearly plan cancelled outside the 14 days: cancel at period end is the default; if the customer asks for
the refund of unused months, refund `(remaining whole months / 12) x amount paid` from the Dashboard and
cancel immediately.

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

### Runbook: guests_minted_per_hour

Counts `Users` rows with `isGuest = true` created in the last hour against the previous 48 hours
(`lib/operational-metrics.ts`, #1150). It breaches at 60 an hour or ten times the baseline hourly
rate, whichever is higher; a normal September 2026 day made 5-17 guests in total. A guest row is
minted by `POST /api/auth/guest-session` and by a `POST /api/lobby/<code>/join-guest` without a
valid guest token, or with one whose guest no longer exists (erased or purged; since #1157 that
is a new guest under a new id, charged to the same new-guest budget, never the old id re-created).

When it fires:

1. Is it real traffic? Vercel Analytics visitors for the same hour, and `OperationalEvents` for
   human events (`lobby_create_ready`, `move_submit_applied`). A post that went viral brings both.
2. Is it scripted? Many guests and no human events. Vercel Firewall -> Traffic, grouped by IP or
   JA4 digest on `/api/auth/guest-session` and `/api/lobby/*/join-guest`. Block the source with an
   IP rule (`vercel firewall ip-blocks`), or lower the `RL guest-session` / `RL lobby join-guest`
   rate-limit rules (see Firewall below). Attack Mode is the last resort: it challenges every page.
3. The rows clean themselves up: never-played guests are purged after three idle days
   (`scripts/cleanup-old-guests.ts`). Do not delete them by name - `boardly-dev` and production are
   shared with other agents and real guests.

### Runbook: rate_limiter_degraded

Any `rate_limiter_degraded` event in the window (#1156). `lib/rate-limit.ts` writes one, at most
once a minute per instance, whenever the shared Upstash store fails - whether the request it
failed on was then refused or served from memory. While the store fails, routes behave in three
ways:

- **Fail closed, 503** (`Retry-After: 30`): register, forgot-password and resend-verification
  (`failClosedAuthPreset`), feedback and content reports. An account or an email is not handed
  out on per-instance limits.
- **Degraded, per-instance limits** (Denys, 2026-09-27): guest-session, join-guest (both budgets),
  lobby create (free and premium) and rematch keep serving from each instance's own memory, under
  the `degraded` limits on their presets: about a third of the shared per-address limit, plus a
  ceiling per instance for every address together, several times the busiest window production
  has seen. Past that ceiling they answer 503 as well. The limits are per instance, so a flood
  from rotating addresses is bounded by the ceilings times the number of warm instances, and by
  the Firewall rules below - which is why this state still alerts. Rematch is limited per lobby
  normally and per address across every lobby only while degraded, so a lobby code cannot
  bring its own per-instance ceiling.
- **Fail open**: game actions and chat fall back to the per-instance memory store at their usual
  limits, and chat history reads come back empty.

Every Upstash call gives up after one retry or 1.5 s (`upstashClientOptions` in
`lib/redis-credentials.ts`), and after three failures in a row an instance stops calling the store
for 15 s and goes straight to the fallback, probing again after that. So an outage costs a
visitor milliseconds, not the seconds of retries the client defaults to.

Upstash commands the limiter spends: one `HINCRBY` per counted request (the counters are fields in
one hash per window, `rate_limit_window:<windowMs>:<window>`), one `EXPIRE` per window per
instance, and none for an address that instance has already seen refused this window, or while
it is paused.

When it fires:

1. `reason` on the event is the Upstash error. `fetch failed` on credentials that look right
   usually means the store was archived after inactivity or the monthly command quota (500K on
   Free) is spent: open the Upstash console for `boardly-cache` (Vercel -> Storage).
2. Quota spent: move the store to pay-as-you-go, or wait for the billing month. The limiter spends
   at most one command per counted request and none on a key it has already refused, and the WAF
   rules below answer most floods before they reach a function, so a spent quota means a very
   large or distributed flood.
3. Credentials changed: check `KV_REST_API_URL` / `KV_REST_API_TOKEN` in Vercel production env.

The alert resolves on the first window without a degraded event.

### Runbook: email_send_failed

Three or more `email_send_failed` events in the window, or any `email_send_budget_reached`
(critical) (#1150, #1158). `lib/email.ts` writes a failure at most once a minute per mail kind per
instance; `lib/email-send-guard.ts` writes the budget event when verification and reset mail hit
`EMAIL_DAILY_SEND_BUDGET` (default 80 a day, under Resend Free's 100).

When it fires:

1. Failures: `reason` is Resend's error. A 401/403 means the API key was revoked or the domain lost
   verification; a 429 means Resend's own quota. Check the Resend dashboard.
2. Budget reached: verification and reset mail is refused until 00:00 UTC; each request still gets
   the generic answer. Real sign-up spike -> raise `EMAIL_DAILY_SEND_BUDGET` in Vercel (and check
   the Resend plan's daily cap first). Scripted -> the per-address cooldown (1 per 10 minutes) and
   daily cap (3 per address) already hold; look at the register and forgot-password traffic in the
   Firewall view and tighten `RL register` / `RL forgot-password`.

### Firewall (Vercel WAF)

Configured 2026-09-24 (#1144) on project `prj_MfQkf6bs9B5Qhf1x8MLX4fYRlnS2`, active config
version 2 (`waf_65fIhzZH2NFe`). Requests the WAF refuses are not billed as function invocations
(https://vercel.com/docs/vercel-firewall/ddos-mitigation); WAF rate limiting is billed per allowed
request that a rate-limit rule evaluates, at $0.50-0.80 per million
(https://vercel.com/docs/pricing/regional-pricing), which at this traffic is nothing.

Rate-limit rules, all `POST`, fixed 60 s window, keyed by IP, default 429. Each is at least five
times the app's own limit, so they only ever catch traffic the app would refuse anyway, and do it
before a function runs:

| Rule | Path | Limit / 60 s | App limit |
| --- | --- | --- | --- |
| RL register | `/api/auth/register` | 25 | 5 / 15 min |
| RL forgot-password | `/api/auth/forgot-password` | 25 | 5 / 15 min |
| RL guest-session | `/api/auth/guest-session` | 25 | 5 / 15 min |
| RL sign-in credentials | `/api/auth/callback/credentials` | 50 | 10 / 15 min |
| RL lobby join-guest | `^/api/lobby/[^/]+/join-guest$` | 600 | 120 / min across codes |

**"RL sign-in login" (`/api/auth/login`, 25/60s) needs removing from the WAF config** (#1138,
2026-09-25): the route it protected was a dead second password-check endpoint with no caller
anywhere in the app and has been deleted. The path is not gone, though — with no `route.ts` left
under `app/api/auth/login`, the request falls through to the catch-all
`app/api/auth/[...nextauth]/route.ts`, and NextAuth 4.24.15 answers 400 ("This action with HTTP
POST is not supported") because "login" is not one of its known actions. The password check itself
is never reached either way, so the rule is now redundant rather than unreachable: traffic still
hits the path and can still trip the rate limit, it is just guarding a route that already refuses
on its own. Nothing to fix in the app — `vercel firewall rules disable "RL sign-in login"` then
`vercel firewall publish --yes` on `prj_MfQkf6bs9B5Qhf1x8MLX4fYRlnS2` is the only remaining step,
and it touches production Vercel Firewall config rather than the codebase.

The managed `bot_protection` and `ai_bots` rulesets are active in **log** mode only (staged by
Denys on 2026-01-27, published with the rules above). Nothing challenges or denies a page.

Commands (from a directory linked to the project, `vercel link`):

- Inspect: `vercel firewall overview`, `vercel firewall rules list`, `vercel firewall diff`.
- Roll back one rule: `vercel firewall rules disable "<name>"`, then `vercel firewall publish --yes`.
  The dashboard (Firewall -> Configure -> version history) can restore an earlier version whole.
- Under attack: `vercel firewall attack-mode` challenges every request to the site; use it only
  when the rules above and IP blocks are not enough, and switch it off afterwards.

Not configured, and Denys's to decide: a Spend Management cap with a webhook (billing), and moving
the managed bot rulesets from log to challenge.

### BotID (#1157)

**Monitor mode since 2026-09-27: `BOTID_MODE=monitor` is set in Vercel Production.** A bot verdict is
logged ("monitor mode lets it through") and recorded as a `botid_flagged` OperationalEvent, and the
request goes on to the route's rate limits. Why: right after the first release an extension-driven
Chrome passed once and was then classified as a bot, and with no other guest traffic that Sunday there
was no way to show that real people pass. After a week, compare `botid_flagged` with real guest
sign-ups; if real players are not flagged, remove `BOTID_MODE` and redeploy to enforce.


Vercel BotID, **Basic** level, on `POST /api/auth/register`, `POST /api/auth/guest-session` and a
token-less `POST /api/lobby/<code>/join-guest` - the requests that mint an account or a guest.
Basic is free on every plan; Deep Analysis costs $1 per 1,000 `checkBotId()` calls on Pro
(https://vercel.com/docs/botid, read 2026-09-27). The level is pinned per route in code
(`lib/botid-routes.ts`, used by both halves), and a per-route level takes precedence over the
project's dashboard setting, so switching Deep Analysis on in Firewall -> Rules does not bill
these routes.

- Browser half: `initBotId()` in `instrumentation-client.ts` attaches the challenge headers to
  matching fetches; `withBotId()` in `next.config.js` serves the challenge script and proxy from
  this origin (two rewrites under a fixed UUID path that `botid/next/config` defines), which the
  CSP's `'self'` covers.
- Server half: `refuseIfBot()` in `lib/bot-protection.ts`, after the rate limit, answers 403
  `BOT_CHECK_FAILED` (the client shows `errors.botCheckFailed`). It runs only where `VERCEL_ENV`
  is `production` or `preview`; locally, in CI and under `next start` nothing is checked. It
  needs the project's OIDC token, which is enabled (`oidcTokenConfig.enabled: true`, checked
  2026-09-27).
- It fails open, and says so. When `checkBotId()` throws, takes longer than 2.5 s
  (`BOTID_TIMEOUT_MS`; the library has no deadline of its own), or answers without a boolean
  `isBot` - which is what `botid/server` returns when Vercel's classifier answers an error body
  such as 401 `ERR_JWT_INVALID` - the request goes on to the rate limits, the error is logged
  (`BotID gave no verdict`), and a `botid_unavailable` OperationalEvent is written, at most once
  a minute per instance. See the runbook below.
- Direct requests - curl, scripts, Playwright's `request` context - carry no challenge and are
  refused on a deployment. That includes two of our own tools pointed at one:
  `A11Y_BASE_URL=<deployment> npm run audit:a11y` (it mints its guest with
  `context.request.post` to `/api/auth/guest-session`, so it cannot reach the bot game screen
  and fails) and `npm run ops:load -- --base-url=<deployment>` (its guest session is a plain
  `fetch`). Both still work against a local server. To let a known client through a
  deployment, add a WAF bypass rule (https://vercel.com/docs/botid#bypassing-botid).
- **Local dev needs api.vercel.com reachable.** The browser half runs everywhere, `next dev`
  included: before each protected fetch it loads its challenge script, which the `withBotId`
  rewrite fetches from api.vercel.com. Offline or behind a firewall that blocks it, that load
  fails, and the patched `fetch` to register, guest-session and join-guest fails in the browser
  with it - so guest entry and signup break locally although the server checks nothing there.
- Where to look: Firewall tab -> traffic filter -> BotID shows each check.
- If real visitors start getting `BOT_CHECK_FAILED`: check the browser console on
  boardly.online for a CSP violation or a failed load of BotID's `c.js` challenge script,
  then roll back by removing the `refuseIfBot` calls; the client half alone refuses nothing.

### Runbook: botid_unavailable

Any `botid_unavailable` event in the window (#1157), severity warning. `lib/bot-protection.ts`
writes one, at most once a minute per instance, when Vercel BotID could not classify a request
to register, guest-session or a token-less join-guest: `checkBotId()` threw, gave no answer
within 2.5 s, or answered without a verdict. Those requests went through on the rate limits
alone, so nothing is refused, but bots are not being filtered either.

When it fires:

1. `reason` on the event says which. "no answer within 2500 ms" is a slow classifier; "answered
   without a verdict" is an error body from api.vercel.com, most often an invalid or missing
   OIDC token; anything else is the thrown error's message.
2. OIDC: Vercel project -> Settings -> Security -> OIDC must be enabled (it was on
   2026-09-27). The token is per deployment, so a redeploy picks up a fixed setting.
3. Check https://www.vercel-status.com for a Firewall or BotID incident.
4. Meanwhile, `guests_minted_per_hour` and the Firewall's rate-limit rules still bound a flood.

The alert resolves on the first window without the event.

### Dependency audit (`npm audit`) — production reachability, 2026-09-25 (#1148)

The 2026-09-24 security audit's `npm audit --omit=dev --json` run was truncated at 40 KB
(after the package `hono`, alphabetically), so packages `l`-`z` and the totals were never
seen. This is the untruncated run, with every remaining advisory labelled build-time or
runtime. It also corrects one thing the audit got wrong: `prisma` (the CLI) was already a
`devDependency` (`package.json`, `devDependencies` block) at audit time, not a `dependency` —
`npm ls prisma --omit=dev` returns empty. `--omit=dev` still surfaces prisma-chain packages
in `npm audit`/`npm ls` output regardless (confirmed by tracing `npm ls mysql2 --omit=dev
--all`, which attributes `mysql2` to `@prisma/client → prisma → mysql2`, an edge that does
not exist in `@prisma/client`'s own `package.json` — an `npm audit`/`ls` display quirk with
hoisted packages, not a manifest problem). Nothing to move.

**Fixed in this pass:**
- `@sentry/nextjs` `^10.42.0` → `^10.75.3`: removes the only advisory the ticket named,
  `@opentelemetry/core < 2.8.0` (GHSA-8988-4f7v-96qf, unbounded memory allocation parsing a
  `baggage` header) — reachable on every function via `@sentry/node`'s HTTP instrumentation.
  `npm audit --omit=dev` now shows nothing under `@sentry/*` or `@opentelemetry/*`.
- `next` and `next-auth` bumped to `16.3.6` / `4.24.15` — both already inside the existing
  `^16.1.6` / `^4.24.7` ranges in `package.json`, so this needed no manifest change, only a
  lockfile update. Found while running this audit, not named in the ticket or in the
  2026-09-24 report (which never got past `hono`): the installed versions carried **two
  critical, unauthenticated advisories** — `next` (Image Optimization API RCE with AVIF
  files, GHSA-2xp9-vwfh-vxw4, and a Windows-hosted RCE, GHSA-p293-qw3h-jr36, both fixed
  `<16.3.3`) and `next-auth` (email-normalizer homoglyph `@`-bypass, GHSA-7rqj-j65f-68wh,
  fixed `<4.24.15`). Both are runtime, in-range, and no other version bump depended on them,
  so fixing them here rather than opening a separate ticket for a change `npm update` already
  covered. Full auth/session/proxy suites (22 files, 141 tests) pass on the new versions.

**`npm audit --omit=dev` totals: 38 → 28** (2 critical → 0, 15 high → 14, 19 moderate → 12,
2 low → 2 unchanged). Everything left, labelled:

| Package | Sev. | Root cause | Build-time or runtime |
| --- | --- | --- | --- |
| `next` | — (fixed) | — | runtime — the framework |
| `nanoid` | high | direct dependency, own advisory (negative-size loop / overflow) | **runtime** — used for lobby/ID generation; fix is in-range (`^5.1.6` already allows the patched 5.1.16, just needs `npm update nanoid`) |
| `resend` | moderate | direct dependency, own advisory | **runtime** — the email-sending client; installed `6.9.3` is inside the vulnerable `6.2.0-canary.0 - 6.12.2` range, fix is in-range |
| `svix` | moderate | via `resend` | shipped in the runtime bundle (webhook-verification helper `resend` carries but this repo never calls — see #1121, which verifies Resend's HMAC by hand) |
| `uuid` | moderate | via `next-auth`, `resend` | runtime, in-range fix (`<11.1.1` buffer bounds check) |
| `sharp` | high | via `next`'s optional image-processing dependency (also separately pinned in this repo's own `devDependencies` for `scripts/discord/render-assets.tsx`) | build-time for this repo's own script; `next`'s copy is not exercised on Vercel, which does image optimization on its own infrastructure |
| `postcss`, `postcss-selector-parser`, `browserslist`, `baseline-browser-mapping` | high/moderate/low | Tailwind/autoprefixer's CSS build pipeline | **build-time only** — runs during `next build`, never in a deployed function |
| `@babel/core`, `brace-expansion`, `picomatch`, `fast-uri` | low/high | `@sentry/nextjs`'s own bundler/source-map-upload plugins (webpack, rollup, glob) | **build-time only** — the Sentry CLI step that runs during `next build`, not the SDK code that ships |
| `prisma`, `@prisma/config`, `@prisma/dev`, `mysql2`, `defu`, `effect`, `deepmerge-ts`, `lodash`, `hono`, `@hono/node-server`, `chevrotain`, `@chevrotain/*`, `@mrleebo/prisma-ast`, `valibot` | high/moderate | Prisma CLI's own toolchain (`prisma generate`/`migrate`/`db push`, its schema parser, its local dev server) | **build/dev-time only** — none of this ships into a Vercel function; only `@prisma/client-runtime-utils` does, and it carries no advisory |
| `yaml` | moderate | Tailwind's `postcss-load-config` | **build-time only** |

`nanoid`, `resend`, `svix` and `uuid` are genuine runtime fixes and are in-range
(`npm update` would take them), but bumping a payments-adjacent send path (`resend`) without
its own review is out of scope here — that is the supply-chain ticket's job, along with
labelling anything this list gets wrong.

### Ads-day checklist: flipping `NEXT_PUBLIC_ADS_ENABLED` on

CLAUDE.md's "no in-tree CMP" rule for ads is conditional (#1153): it holds only as long as
Google's own consent message actually renders and produces a TC string in the EEA/UK. Before
setting `NEXT_PUBLIC_ADS_ENABLED=true` on the **Production** environment in Vercel, run every
step below in order and do not flip the switch if any of steps 1–3 fails.

1. **AdSense shows the site approved.** The AdSense console must say boardly.online is
   approved and serving, not "Getting ready".
2. **The message renders and produces a TC string.** On a fresh EEA-geolocated Chrome
   profile (`--use-mock-keychain`, see the CLAUDE.md browser-automation note), load the home
   page and one guide page. Google's consent message must render on first load of each, and
   `window.__tcfapi('getTCData', 2, cb)` must return a non-empty `tcString` with `cmpId: 300`
   (Google's own CMP). #1067 measured `displayStatus: hidden` and an empty TC string while
   ads were off — that must have changed before this step passes.
3. **No ad request before the visitor chooses.** With the network panel open, confirm no
   request to `googleads.g.doubleclick.net` or an ad-serving `pagead2.googlesyndication.com`
   path fires before the visitor accepts or dismisses the message. Google's stated TCF
   behaviour is described at
   [support.google.com/admanager/answer/9805023](https://support.google.com/admanager/answer/9805023);
   there is no AdSense-specific page for this, so verify it empirically rather than citing one.
4. **Declining yields no ad, or a non-personalised one, and no advertising cookie.** Decline
   the message and re-check cookies/storage for `googleads.g.doubleclick.net` and
   `pagead2.googlesyndication.com` — none should exist afterward.
5. **The withdrawal link works.** The footer's "Privacy and cookie settings" control
   (`lib/consent.ts`, `reopenGoogleConsentMessage`) must reopen the same message.
6. **The variable is set for Production only, never Preview.** A Preview deployment serving
   ads would put a non-production host in front of real ad requests.
7. **The label reads "Advertisements"** (`common.advertisement` in all four locale files,
   per Google's placement policy at
   [support.google.com/adsense/answer/1346295](https://support.google.com/adsense/answer/1346295)),
   and the unit stays the last element before the footer on guide pages — none on any game
   route (CLAUDE.md's ads rules).
8. **If step 2 or 3 fails:** leave `NEXT_PUBLIC_ADS_ENABLED` unset and open a ticket. A
   home-made banner is not a certified TCF CMP, and shipping ads without one is the thing
   this checklist exists to prevent.
9. **After go-live, watch AdSense's Transactions page** for invalid-activity deductions in
   the days that follow.

### CSP hardening verification (preview/production)

Check response headers for representative routes (for example `/games`, `/lobby`, `/auth/login`):

- `Content-Security-Policy` `script-src` includes `'self'` and trusted script origins
- `Content-Security-Policy` `script-src` includes `'unsafe-inline'` (required by current Next.js App Router bootstrap output)
- `Content-Security-Policy` does not include `'unsafe-eval'` in `script-src`
- `Content-Security-Policy` `connect-src` has no `localhost`/`127.0.0.1` entry in production (#1146)
- `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, `Cross-Origin-Opener-Policy:
  same-origin-allow-popups`, `Cross-Origin-Resource-Policy: same-site` (#1146)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (`vercel.json`, #1146) —
  only visible on an HTTPS response, since HSTS itself is what tells a browser to always use
  HTTPS for this host next time

Example:

```bash
curl -I https://boardly.online/games | grep -iE 'content-security-policy|x-frame-options|x-xss-protection|cross-origin-|strict-transport-security'
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

`ops:load` defaults to `http://localhost:3000`. Against a Vercel deployment its first request,
a plain `fetch` to `/api/auth/guest-session`, gets 403 `BOT_CHECK_FAILED` from BotID (#1157), so
point it at a local server, or add a WAF bypass rule for the machine running it (see BotID).

## Accessibility audit (axe)

forskrift om universell utforming av IKT-løsninger § 4 binds this private site to WCAG
2.0 A/AA today (#1171). `npm run audit:a11y` (`scripts/audit-a11y.ts`) is the automated
check: it drives a headless, isolated Chromium — never a developer's own Chrome, see
"Driving a browser on this Mac" in `CLAUDE.md` — through `/`, `/lobby`, `/auth/register`,
`/auth/login`, `/premium`, `/terms`, `/privacy`, `/withdrawal`, and one bot game screen
(Tic-Tac-Toe vs a bot, reached by minting a guest session and using Quick Play exactly as
a real guest would), running `@axe-core/playwright` with the `wcag2a`/`wcag2aa` tags on
each.

```bash
npm run audit:a11y                                     # scans http://localhost:3000
A11Y_BASE_URL=https://preview-x.vercel.app npm run audit:a11y
```

Against a deployment (the second line) the run now fails on the bot game screen: it mints its
guest with `context.request.post` to `/api/auth/guest-session`, which carries no BotID
challenge and gets 403 `BOT_CHECK_FAILED` (#1157). The eight page scans still run. Scan a local
server, or add a WAF bypass rule for the machine running it (see BotID).

It fails (non-zero exit) on any `serious` or `critical` violation that is not in
`scripts/a11y-allowlist.json`, and on failing to reach the bot game screen at all — that
route is named in #1171's acceptance criteria, so a skip is treated as a failure rather
than a silently-passing scan of 8 routes instead of 9.

**The allowlist holds brand-colour contrast items only, each with a reason** — the three
gaps DESIGN.md's "Contrast" table documents as Denys's call, not a bug: white text on
`bd-coral` (the primary CTA fill, `.bd-btn-coral`, and the same fill at reduced opacity),
and white text on `bd-lav` (the feedback widget's floating button). Matching is by axe's
own rule id plus the exact `fgColor`/`bgColor` pair it measured, not by CSS selector — the
same two colour pairs recur across many components (every primary button, every page),
and a selector-based allowlist would need one entry per instance and go stale the moment a
new button uses the same fill. `bd-input`'s resting border (1.3:1, the third gap in
DESIGN.md) never appears here: axe-core has no automated rule for WCAG 1.4.11 (non-text
contrast), so it is a real gap that only a manual review catches, already recorded in
DESIGN.md.

**Never add anything else to the allowlist.** Every other violation this script finds must
be fixed in the code, the same way the rest of #1171's cleanup was done: swap `bd-ink-muted`
for `bd-ink-soft` on normal-size text (DESIGN.md's own table already says `bd-ink-muted` is
AA-large-only), swap a "-deep" accent text colour for `bd-ink`/`bd-ink-soft` when even the
deep variant does not clear 4.5:1 against its background, add a missing `aria-label`, or
fix the underlying markup (e.g. a nested interactive control). None of those require
touching a brand hex value.

**The bot-game route shares a rate limit with everyone else on this machine.**
`/api/auth/guest-session` allows 5 requests per 15 minutes per IP
(`lib/rate-limit.ts` `auth` preset), and against `boardly-dev` that counter is shared
Upstash state across every agent running locally (`CLAUDE.md`). The script retries a 429
a couple of times with backoff before giving up; running it twice in quick succession
against a local dev server can still exhaust the window. That is the rate limit working as
designed, not a broken endpoint — wait for the window to reset (`retryAfter` in the 429
body) rather than concluding the script is broken.

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
