# Architecture

## System topology

Boardly uses a dual-server model:

- Next.js app server (`:3000`): API routes, auth, pages, SSR.
- Socket.IO server (`:3001`): realtime room events, connection lifecycle, presence.
- PostgreSQL (Supabase) via Prisma.

## Authoritative state flow

1. Client sends action to API route.
2. API validates actor, permissions, and game rule constraints.
3. API persists authoritative state in DB.
4. API notifies socket server (`/api/notify`).
5. Socket server broadcasts update to `lobby:<code>` room.
6. Clients reconcile local UI with server snapshot.

Client optimism is allowed for responsiveness, but server state is final.

## Game architecture

### Base contract

All games implement `GameEngine` (`lib/game-engine.ts`) and expose:

- `validateMove(move)`
- `processMove(move)`
- `getInitialGameData()`

### Current game types in schema

`prisma/schema.prisma` enum `GameType`:

- `yahtzee`
- `guess_the_spy`
- `tic_tac_toe`
- `rock_paper_scissors`
- plus reserved values for future (`chess`, `uno`, `other`)

## Realtime patterns

Key files:

- `socket-server.ts`
- `types/socket-events.ts`
- `app/lobby/[code]/hooks/useSocketConnection.ts`

Important safeguards:

- event sequencing metadata (`sequenceId`, `timestamp`)
- deduplication on reconnect bursts
- room-based broadcasting (`lobby:<code>`)
- disconnect handling with turn advancement for disconnected active players

## Auth and identity model

### Registered users

- NextAuth session/JWT
- canonical signing secret: `NEXTAUTH_SECRET`

### Guest users

- server-issued signed guest JWT
- identity header: `X-Guest-Token`
- verification path: `lib/guest-auth.ts` + socket auth middleware

### Secret policy

- `NEXTAUTH_SECRET` is canonical for auth/session signing
- optional `GUEST_JWT_SECRET` can isolate guest token signing

## Data model summary

Core tables (pluralized schema):

- `Users`, `Bots`
- `Lobbies`, `Games`, `Players`
- `FriendRequests`, `Friendships`
- NextAuth auth/session/token tables

Game state is persisted as JSON in `Games.state` and treated as source of truth for replay/recovery.

## Database timestamp policy

### Policy (effective now)

- For new server-authored timestamps in PostgreSQL, prefer `TIMESTAMPTZ` (`timestamp with time zone`).
- Treat database timestamps as UTC-backed canonical server time.
- Do not introduce broad table-wide timestamp conversions in feature PRs.
- For Prisma migrations that need `TIMESTAMPTZ`, use explicit SQL in migration files (Prisma `DateTime` defaults to `TIMESTAMP(3)` in generated SQL).

### Scope guidance

Use `TIMESTAMPTZ` by default for:

- audit/event timestamps (`occurredAt`, `createdAt`, `processedAt`, `sentAt`)
- scheduler/cron timestamps
- timeout/deadline/retry timestamps
- cross-region/cross-device reconciliation timestamps

`TIMESTAMP WITHOUT TIME ZONE` may be tolerated only when preserving compatibility in existing tables during phased migration.

### Phased migration plan (no big-bang)

1. New tables/columns: `TIMESTAMPTZ` by default (no retroactive conversion in same PR).
2. Low-risk append-only tables first (events/notifications/operational telemetry).
3. Medium-risk gameplay/social timestamps (`Games`, `Lobbies`, `Players`, `FriendRequests`, etc.) with targeted migrations and regression tests.
4. Auth/session-related tables only after adapter/compatibility review.
5. Legacy cleanup pass when operational telemetry shows no parsing/serialization regressions.

### Compatibility assumptions to preserve

- App/server code should treat Prisma `DateTime` values as JS `Date` objects and serialize via ISO strings (UTC).
- Do not compare timestamp strings lexicographically in business logic; compare `Date`/epoch values.
- Client UI may localize display, but server persistence and API payload semantics remain UTC-based.

## Quality guardrails

- Keep game-specific logic isolated under `lib/games/` and game-specific UI blocks.
- Avoid hardcoded single-game behavior in shared lobby/socket handlers.
- Prefer strict TypeScript contracts over implicit shape assumptions.
- Maintain tests for rules, scoring, reconnect, and turn transition behavior.
