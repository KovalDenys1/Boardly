# Boardly

Real-time multiplayer board games platform built with Next.js, TypeScript, Supabase Realtime, Prisma, and PostgreSQL.

Production: <https://boardly.online>

## Origin

Boardly is an idea I had been carrying around for a long time: a place to play board games with friends online, no downloads, no accounts required.

The push to actually build it came from a school assignment. My teacher, Tarald, asked us to implement Yahtzee. I finished the assignment and realised this was the moment to start the site I had been thinking about. Yahtzee became the first game on Boardly, and everything else grew from there.

## Games

Lifecycle state lives in `lib/game-catalog.ts` and nowhere else. `available` is what the
site promotes – a create-lobby entry and an indexed `/games/<game>` page. `in-development`
is built and reachable behind a feature flag or a direct lobby code; it still appears on
`/games` under a "Coming soon" chip, but it is out of the sitemap and any page it has is
`noindex`. `planned` has a catalog entry, a name and an icon, and no engine or route
behind them.

**Available (11):** Yahtzee, Guess the Spy, Tic-Tac-Toe, Memory, Connect Four, Alias, Rock Paper Scissors, Liar's Party, Sketch & Guess, Checkers, Ludo
**In development:** Fake Artist, Telephone Doodle
**Planned:** Words-Mines, Anagrams, Crocodile, Alibi Night

`npm run audit:docs` fails if these three lines and the catalog ever disagree.

## Key pages

| Route | What it is |
|---|---|
| `/` | home – game ribbon, quick play, FAQ |
| `/games` | the catalog; each available game also has `/games/<game>` and `/games/<game>/lobbies` |
| `/lobby/create`, `/lobby/[code]` | create a lobby, then play in it; `/lobby/[code]/spectate` to watch |
| `/guides` | SEO guide pages, driven by `lib/guides-catalog.ts` |
| `/premium` | Boardly Premium plans and checkout |
| `/about` | what Boardly is and who builds it |
| `/discord` | 302 to the community server invite |
| `/leaderboard`, `/friends`, `/profile`, `/u/[publicProfileId]` | social and account pages |

## Tech stack

- **Framework:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS (CSS variable-based theme system, dark/light mode)
- **Database:** PostgreSQL via Prisma 7 (hosted on Supabase)
- **Auth:** NextAuth — registered users + signed guest JWT (`X-Guest-Token` header)
- **Realtime:** Supabase Realtime Broadcast + Postgres Changes (replaces Socket.IO)
- **Payments:** Stripe subscription, monthly or yearly – the monthly list price lives in
  `PREMIUM_BASE_PRICE` (`lib/stripe.ts`), the two Stripe Price ids in
  `STRIPE_PREMIUM_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID_YEARLY`, and the yearly plan is
  offered only when the second one is set. Stripe Adaptive Pricing converts the charge to
  the customer's own currency, so prices render behind a "from". Plans and checkout live on
  `/premium`
- **i18n:** 4 locales — English, Russian, Norwegian, Ukrainian
- **Hosting:** Vercel (Next.js app)

## Architecture

```
Client action → API route → DB update → Supabase Realtime Broadcast → client reconcile
```

Server state is always authoritative. Clients may apply optimistic updates for UX only.

- **Broadcast**: `lib/supabase-server.ts` → `broadcastToLobby(code, event, payload)` – stateless REST POST, works in Vercel serverless functions. It **should** be `await`ed before the response returns, because Vercel kills pending promises after `return` – but most call sites still fire it with `void`.
- **Postgres Changes**: auto-broadcast when `prisma.lobbies.update()` runs – subscribed client-side via `app/lobby/[code]/hooks/useRealtimeConnection.ts`.
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
| `UPSTASH_REDIS_REST_URL` | Redis URL for chat persistence and rate limiting (the Vercel Marketplace spelling `KV_REST_API_URL` is read too) |

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
pnpm ci:quick         # lint + typecheck + arch, responsive, emoji and docs audits
pnpm check:locales    # Verify all 4 locale files have identical keys
pnpm db:generate      # Regenerate Prisma client
pnpm db:push          # Push schema changes (dev only)
pnpm db:migrate       # Run pending migrations (production)
pnpm db:audit         # compare live tables and RLS against the expected set
pnpm audit:docs       # check these docs against the code they describe
```

## Branching

- `develop` — integration branch, all feature PRs merge here first
- `main` — production, only merges from `develop` via PR
- `hotfix/*` — critical prod fixes, merge to `main` + `develop`

Branch naming: `feature/<issue-number>-short-description` or `fix/<issue-number>-description`
Commit format: `#<issue-number> feat/fix/chore: description`

## Localization

All user-visible strings go through `t()`. Locale files: `locales/en.ts`, `ru.ts`, `no.ts`, `uk.ts`, and all four must have identical keys – that part is enforced by `pnpm check:locales`, which the pre-commit hook runs when a locale file is staged. Nothing checks mechanically that a string went through `t()` at all, so a hardcoded string is caught in review.

## Documentation

- Index of every doc: `docs/README.md`
- Architecture and data flows: `docs/ARCHITECTURE.md`
- Local setup: `docs/LOCAL_SETUP.md`
- Operations and deployment: `docs/OPERATIONS.md`
- Database and RLS: `docs/DATABASE.md`
- Security model: `docs/SECURITY_MODEL.md`
- Adding or promoting a game: `docs/GAME_DEVELOPMENT.md`
- Responsive Definition of Done: `docs/RESPONSIVE.md`
- Discord integration map: `docs/DISCORD.md`
- Design system: `DESIGN.md`
- Bot developer guide: `lib/bots/README.md`
- Migrations notes: `prisma/migrations/README.md`

## Community

- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- License: `LICENSE`
