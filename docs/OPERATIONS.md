# Operations

## Local development

### Prerequisites

- Node.js 18+
- PostgreSQL/Supabase
- npm

### Setup

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:push
npm run dev:all
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
npm run dev:all
```

### Daily sync workflow

```bash
git pull
npm install
npm run db:generate
npm run dev:all
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
- `socket-server.ts` loads `.env.local` first, then `.env` as fallback.
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
- `NEXT_PUBLIC_SOCKET_URL` (explicit socket endpoint in non-local envs)
- `ANALYTICS_ALLOWED_USER_IDS` / `ANALYTICS_ALLOWED_EMAILS` (restrict analytics endpoints)
- `OPS_ALERT_WEBHOOK_URL` (alerts channel webhook)
- `OPS_ALERT_WINDOW_MINUTES`, `OPS_ALERT_BASELINE_DAYS`, `OPS_ALERT_REPEAT_MINUTES`
- `OPS_RUNBOOK_BASE_URL` (optional absolute runbook links in alert payloads)
- `CLEANUP_GUEST_DAYS` (optional guest retention window, defaults to `3`)
- `REPLAY_RETENTION_DAYS` (optional replay retention window for finished/abandoned/cancelled games, defaults to `90`)
- GitHub Actions scheduler secrets (if using `.github/workflows/reliability-alerts-cron.yml`):
- `RELIABILITY_ALERTS_CRON_URL` (for example `https://boardly.online/api/cron/reliability-alerts`)
- `CRON_SECRET` (must match the app env value used by the endpoint)

## Secret migration notes

Canonical secrets only:

- `NEXTAUTH_SECRET`
- `SOCKET_SERVER_INTERNAL_SECRET`
- `CRON_SECRET`

Migration from deprecated aliases:

1. Remove `JWT_SECRET` from all app/socket environments.
2. Ensure `NEXTAUTH_SECRET` is set and has at least 32 characters.
3. Remove `SOCKET_INTERNAL_SECRET` from all app/socket environments.
4. Ensure `SOCKET_SERVER_INTERNAL_SECRET` is set and has at least 16 characters.
5. Ensure `CRON_SECRET` is set and scheduler jobs send `Authorization: Bearer ${CRON_SECRET}`.
6. Do not use `NEXTAUTH_SECRET` for cron endpoint authorization.
7. Redeploy Next.js app and socket service together.
8. Verify `/api/notify`, internal metrics auth, and `/api/cron/*` auth still succeed.

## Build and deploy

### Frontend

- Platform: Vercel
- Command: `npm run build`

### Socket server

- Platform: Render (web service)
- Build command should not run DB migrations in this service.
- Current `render.yaml` pattern:
  - build: `npm ci && npm run db:generate`
  - start: `npm run socket:start`

Reason: running migrations in socket build can hang deployments.

## Production runbook

1. Deploy schema changes from one controlled migration job (`npm run db:migrate`).
2. Deploy Next.js app.
3. Deploy socket service.
4. Verify health endpoint (`/health`) and lobby join flow.
5. Verify the alert scheduler (GitHub Actions or Vercel cron), endpoint (`/api/cron/reliability-alerts`), and webhook delivery.
6. Check operational dashboard and SLO cards from `docs/REALTIME_TELEMETRY.md`.

Note: `npm run db:migrate` automatically bootstraps required RLS roles
(`anon`, `authenticated`, `service_role`) before running `prisma migrate deploy`,
so CI/local PostgreSQL environments do not require a separate manual role-prep step.

### Timestamp migration rollout notes (`timestamptz` phases)

When migrating existing timestamp columns from `TIMESTAMP` to `TIMESTAMPTZ`:

- batch by table/domain (do not convert unrelated tables in one release)
- deploy schema migration first, then application changes if parsing/serialization logic changes
- verify cron/scheduler paths and realtime timer logic after deploy (timestamp-sensitive flows)
- check for DB locks/statement timeout risk on large tables before running DDL in production
- validate API payloads still emit ISO timestamps and UI date rendering remains correct

Recommended verification after each phase:

- `npm run check:db`
- critical cron/manual endpoint smoke (`/api/cron/*` used in that phase)
- one realtime gameplay flow (create/join/play/reconnect) if gameplay timestamps changed

## Common troubleshooting

### Render build hangs after Prisma datasource log

Likely cause: migration/DB step in wrong service or waiting on pooled connection.

Check:

- socket service build command does not call `prisma migrate`
- migrations run in dedicated job/service only
- `DIRECT_URL` is configured for migrations

### Socket not connecting locally

Check:

- both servers running (`npm run dev:all`)
- `CORS_ORIGIN` includes your frontend origin
- `NEXT_PUBLIC_SOCKET_URL` is correct (or unset for local default)

### Guest requests unauthorized

Check:

- client sends `X-Guest-Token`
- token is created through `/api/auth/guest-session`
- `NEXTAUTH_SECRET` or `GUEST_JWT_SECRET` is configured

### Reconnect reliability regressed

Check:

- reconnect telemetry and SLO cards in `docs/REALTIME_TELEMETRY.md`
- spike in `socket_reconnect_failed_final` by `reason`
- spike in `socket_auth_refresh_failed` by `stage` or `status`
- increase in `lobby_join_ack_timeout` after deploys

### Alerts not firing

Check:

- `OPS_ALERT_WEBHOOK_URL` is configured and valid
- cron auth header includes `Bearer ${CRON_SECRET}` for `/api/cron/reliability-alerts` (no `NEXTAUTH_SECRET` fallback)
- if using GitHub Actions scheduling, `RELIABILITY_ALERTS_CRON_URL` and `CRON_SECRET` repo secrets are configured
- `OperationalEvents` contains recent `rejoin_timeout` / `auth_refresh_failed` / `move_apply_timeout`
- run manual dry-run: `npm run ops:alerts:check -- --dry-run`

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

# Build operational KPI report (baseline + SLO status)
npm run ops:kpi:report -- --hours=24 --baseline-days=7

# Run load scenario and produce fail-rate report
npm run ops:load -- --iterations=80 --concurrency=12 --game-type=tic_tac_toe --report-path=reports/ops-load.json
```
