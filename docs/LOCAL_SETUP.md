# Local Setup

How to run Boardly against a PostgreSQL database on your own machine, with no hosted
services except the ones you choose to switch on.

## What you get

- PostgreSQL on your machine
- The Next.js app on `http://localhost:3000` – pages, API routes and auth

There is no second process. Realtime is Supabase Broadcast called over REST from the API
routes, so there is no socket server to start; see `docs/ARCHITECTURE.md`.

## Prerequisites

- Node.js 20.19+ (required by Prisma 7; CI runs Node 20)
- npm
- PostgreSQL 14+ running locally

Optional: Docker, if you prefer PostgreSQL in a container.

## 1. Clone and install

```bash
git clone <repo-url>
cd Boardly
npm install
```

## 2. Start PostgreSQL locally

### Option A: local PostgreSQL service

```bash
createdb boardly_local
```

If your local PostgreSQL user is not `postgres`, replace the username in the `.env.local`
example below.

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

```bash
cp .env.example .env.local
```

For a local stack this is enough:

```env
NODE_ENV=development

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boardly_local
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/boardly_local

NEXTAUTH_SECRET=replace-with-a-long-random-string-at-least-32-chars
NEXTAUTH_URL=http://localhost:3000

CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

CRON_SECRET=replace-with-another-long-random-string-at-least-32-chars
```

Generate secrets with:

```bash
openssl rand -base64 32
```

`prisma.config.ts` loads `.env` with `override: true` when that file exists, and falls back
to `.env.local` only when it does not. So a stray `.env` silently wins over `.env.local` and
over your shell for every Prisma command.

## 4. What you lose by leaving the hosted integrations unset

Leave these unset and the app still starts:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- Google / GitHub / Discord OAuth variables
- `STRIPE_SECRET_KEY` and the rest of the Stripe block
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- Sentry variables

The cost of each:

- **No Supabase:** `broadcastToLobby` returns `false` instead of broadcasting, so a second
  browser does not see the first one's moves until it refetches. Everything server-side still
  works. Point the three Supabase variables at a free project when you need to test realtime.
- **No Resend:** email sending is skipped, so verification and password reset go nowhere.
- **No OAuth variables:** those providers do not appear on the sign-in page.
- **No Stripe:** `/premium` and the checkout routes fail; nothing else does.
- **No Redis:** chat history is not persisted and rate limiting falls back to a per-process
  in-memory counter that resets with the dev server.
- **No Sentry:** errors stay in the console.

## 5. Prepare the database

```bash
npm run db:generate
npm run db:push
```

Check it:

```bash
npm run check:env:quiet
npm run check:db
```

## 6. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## 7. Local smoke test

1. Open `http://localhost:3000`
2. Create a guest session, or sign in with a local account
3. Create a lobby
4. Start a game
5. Verify moves update in the UI

For a game that needs three or more players, fill the seats over the public join API rather
than opening a second tab – a second tab shares cookies and is the same guest. See the
"Testing a game that needs three or more real players" section of `CLAUDE.md`.

## Common local problems

### `DATABASE_URL` is set but Prisma cannot connect

Check that PostgreSQL is running, that the database exists, that the credentials match, and
that no stray `.env` is overriding `.env.local`.

```bash
npm run check:db
npm run db:validate
```

### Lobby or game pages behave strangely after schema changes

```bash
npm run db:generate
npm run db:push
```

Then restart `npm run dev`.

### Email or OAuth flows fail locally

Expected when those variables are unset. They are not needed for a local gameplay loop.

## Before you push

```bash
npm run ci:quick
npm test
npm run check:locales
```

The `pre-push` hook runs `db:generate`, `ci:quick` and the smoke tests, and blocks a direct
push to `main`.

## Related docs

- `README.md`
- `docs/OPERATIONS.md`
- `docs/CONTRIBUTING.md`
- `docs/ARCHITECTURE.md`
