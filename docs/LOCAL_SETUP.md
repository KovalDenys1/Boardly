# Local Setup

This guide explains how to run Boardly fully locally without Supabase, Vercel, Render, Resend, or other hosted services.

## Goal

At the end of this setup you should have:

- PostgreSQL running on your machine
- Next.js app running on `http://localhost:3000`
- Socket.IO server running on `http://localhost:3001`
- Prisma schema pushed to a local database

## Prerequisites

- Node.js 20.19+ (required by Prisma 7)
- npm
- PostgreSQL 14+ running locally

Optional:

- Docker, if you prefer to run PostgreSQL in a local container

## 1. Clone and install

```bash
git clone <repo-url>
cd Boardly
npm install
```

## 2. Start PostgreSQL locally

Use whichever local-only option you prefer.

### Option A: local PostgreSQL service

Create a database:

```bash
createdb boardly_local
```

If your local PostgreSQL user is not `postgres`, replace the username in the `.env.local` example below.

### Option B: Docker

```bash
docker run --name boardly-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=boardly_local \
  -p 5432:5432 \
  -d postgres:16
```

## 3. Create `.env.local`

Copy the template:

```bash
cp .env.example .env.local
```

For a local-only stack, this minimal config is enough:

```env
NODE_ENV=development

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boardly_local
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/boardly_local

NEXTAUTH_SECRET=replace-with-a-long-random-string-at-least-32-chars
NEXTAUTH_URL=http://localhost:3000

CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

CRON_SECRET=replace-with-another-long-random-string-at-least-32-chars

# Optional locally. Leave unset unless you need explicit overrides.
# NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
# SOCKET_SERVER_URL=http://localhost:3001
# SOCKET_SERVER_INTERNAL_SECRET=replace-with-at-least-16-chars
```

Generate local secrets:

```bash
openssl rand -base64 32
```

## 4. Leave hosted integrations disabled

For normal local development you do not need:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `RESEND_API_KEY`
- Google / GitHub / Discord OAuth env vars
- Sentry env vars
- Upstash env vars

Without these values:

- email sending is skipped
- OAuth providers are unavailable
- Sentry is disabled
- local DB still works normally through Prisma

## 5. Prepare the database

Generate Prisma client and push schema:

```bash
npm run db:generate
npm run db:push
```

Recommended checks:

```bash
npm run check:env:quiet
npm run check:db
```

## 6. Start the app and socket server

Preferred:

```bash
npm run dev:all
```

Or in separate terminals:

```bash
npm run dev
npm run socket:dev
```

Open:

- app: `http://localhost:3000`
- socket server: `http://localhost:3001`

## 7. Local smoke test

Recommended quick smoke path:

1. Open `http://localhost:3000`
2. Create a guest session or sign in with a local account if you already have one
3. Create a lobby
4. Start a game
5. Verify moves update in the UI

## Local architecture notes

- The browser connects to Socket.IO on port `3001`.
- The Next.js server stays on port `3000`.
- Prisma talks directly to your local PostgreSQL instance.
- In development, protected internal socket endpoints are allowed without `SOCKET_SERVER_INTERNAL_SECRET`.

## Common local-only problems

### `DATABASE_URL` is set but Prisma cannot connect

Check:

- PostgreSQL is actually running
- the database exists
- username/password in `.env.local` match your local PostgreSQL setup

Useful commands:

```bash
npm run check:db
npm run db:validate
```

### App loads but socket does not connect

Check:

- `npm run socket:dev` is running
- `CORS_ORIGIN` includes `http://localhost:3000`
- `NEXT_PUBLIC_SOCKET_URL` is unset or points to `http://localhost:3001`

### Lobby/game pages behave strangely after schema changes

Refresh Prisma artifacts and schema:

```bash
npm run db:generate
npm run db:push
```

Then restart `npm run dev:all`.

### Email or OAuth flows fail locally

That is expected if you intentionally left those env vars unset. They are not required for a fully local gameplay/dev loop.

## Recommended pre-change check

Before larger changes:

```bash
bash scripts/codex-quick-check.sh --skip-db
```

Or, if local DB is running:

```bash
bash scripts/codex-quick-check.sh
```

## Related docs

- `README.md`
- `docs/OPERATIONS.md`
- `docs/CONTRIBUTING.md`
- `docs/ARCHITECTURE.md`
