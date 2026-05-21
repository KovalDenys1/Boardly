# Boardly

Real-time multiplayer board games platform built with Next.js, TypeScript, Supabase Realtime, Prisma, and PostgreSQL.

Production: <https://boardly.online>

## Games

**Available (6):** Yahtzee, Guess the Spy, Tic-Tac-Toe, Connect Four, Memory, Alias
**In development:** Rock Paper Scissors, Liar's Party
**Planned:** Sketch & Guess

## Tech stack

- **Framework:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS (CSS variable-based theme system, dark/light mode)
- **Database:** PostgreSQL via Prisma 7 (hosted on Supabase)
- **Auth:** NextAuth — registered users + signed guest JWT (`X-Guest-Token` header)
- **Realtime:** Supabase Realtime Broadcast + Postgres Changes (replaces Socket.IO)
- **Payments:** Stripe monthly subscription ($2.99/mo)
- **i18n:** 4 locales — English, Russian, Norwegian, Ukrainian
- **Hosting:** Vercel (Next.js app)

## Architecture

```
Client action → API route → DB update → Supabase Realtime Broadcast → client reconcile
```

Server state is always authoritative. Clients may apply optimistic updates for UX only.

- **Broadcast**: `lib/supabase-server.ts` → `broadcastToLobby(code, event, payload)` — stateless REST POST, works in Vercel serverless functions. Always `await`ed before response (Vercel kills pending promises after `return`).
- **Postgres Changes**: auto-broadcast when `prisma.lobbies.update()` runs — subscribed client-side via `useRealtimeConnection.ts`.
- **Social events** (rematch, invite): `user:{userId}` Broadcast channel via `SocialLoopListener`.
- **Chat**: persisted to Redis (Upstash), broadcast via Supabase Broadcast after write.
- **Spectators**: Supabase Presence (spectator list/count) + Broadcast (spectator chat).

## Quick start

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill required values in `.env.local`. Key variables:

| Variable | Description |
|---|---|
| `NEXTAUTH_SECRET` | JWT signing secret for auth/session tokens |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `UPSTASH_REDIS_REST_URL` | Redis URL for chat persistence |

### 3. Prepare database

```bash
pnpm db:generate
pnpm db:push
```

### 4. Start development

```bash
pnpm dev
```

## Common scripts

```bash
pnpm dev              # Start Next.js dev server
pnpm build            # prisma generate + next build
pnpm test             # Jest test suite
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm ci:quick         # lint + typecheck + arch audit
pnpm check:locales    # Verify all 4 locale files have identical keys
pnpm db:generate      # Regenerate Prisma client
pnpm db:push          # Push schema changes (dev only)
pnpm db:migrate       # Run pending migrations (production)
pnpm db:audit         # Prisma schema audit
```

## Branching

- `develop` — integration branch, all feature PRs merge here first
- `main` — production, only merges from `develop` via PR
- `hotfix/*` — critical prod fixes, merge to `main` + `develop`

Branch naming: `feature/<issue-number>-short-description` or `fix/<issue-number>-description`
Commit format: `#<issue-number> feat/fix/chore: description`

## Localization

All user-visible strings go through `t()` — hardcoded strings are blocked by the pre-commit hook. Locale files: `locales/en.ts`, `ru.ts`, `no.ts`, `uk.ts`. All four must have identical keys (enforced by `pnpm check:locales`).

## Documentation

- Architecture and data flows: `docs/ARCHITECTURE.md`
- Local setup: `docs/LOCAL_SETUP.md`
- Operations and deployment: `docs/OPERATIONS.md`
- Security model: `docs/SECURITY_MODEL.md`
- Bot developer guide: `lib/bots/README.md`
- Migrations notes: `prisma/migrations/README.md`

## Community

- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- License: `LICENSE`
