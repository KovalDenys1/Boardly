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
- `NEXT_PUBLIC_SOCKET_URL` (explicit socket endpoint in non-local envs)
- `ANALYTICS_ALLOWED_USER_IDS` / `ANALYTICS_ALLOWED_EMAILS` (restrict analytics endpoints)

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
5. Check reconnect dashboard and alerts from `docs/REALTIME_TELEMETRY.md`.

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
