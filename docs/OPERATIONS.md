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

## Environment file strategy

Use one primary file for local dev: `.env.local`.

Notes:

- Next.js automatically loads `.env.local`.
- `socket-server.ts` explicitly loads `.env.local` first, then `.env` as fallback.
- Keep `.env` optional (e.g. migration-specific overrides), not mandatory.

If you want a single-file setup, keep only `.env.local` and remove secrets from `.env`.

## Required env vars (minimum)

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `CORS_ORIGIN`

Recommended:

- `DIRECT_URL` (for migrations)
- `GUEST_JWT_SECRET` (guest token signing isolation)
- `NEXT_PUBLIC_SOCKET_URL` (explicit socket endpoint in non-local envs)

## Build and deploy

### Frontend

- Platform: Vercel
- Command: `npm run build`

### Socket server

- Platform: Render (web service)
- Build command should not run DB migrations in this service.
- `render.yaml` currently uses:
  - build: `npm ci && npm run db:generate`
  - start: `npm run socket:start`

Reason: running migrations in socket build can cause hanging deployments.

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
