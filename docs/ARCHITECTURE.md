# Architecture

## System topology

Boardly uses a single-server model:

- Next.js app server (`:3000`): API routes, auth, pages, SSR.
- Supabase Realtime: Broadcast + Postgres Changes (no separate process — stateless REST calls from API routes, channel subscriptions on the client).
- PostgreSQL (Supabase) via Prisma.

## Authoritative state flow

1. Client sends action to API route.
2. API validates actor, permissions, and game rule constraints.
3. API persists authoritative state in DB.
4. API broadcasts the update to the lobby's Supabase Broadcast channel. The topic is
   `lobby:<code>:<realtimeSecret>` – both sides build it in `lib/lobby-realtime-topic.ts`,
   and the secret is handed out by `GET /api/lobby/[code]/realtime-topic` to players and, inside the
   topic string, by the spectate route to admitted spectators. It is not readable through PostgREST or
   Postgres Changes since migration `20260924141000` (no grant on the column). Every message the server
   sends is signed (see "Signed broadcasts" below).
5. Clients verify the signature, then reconcile local UI with the server snapshot.

Client optimism is allowed for responsiveness, but server state is final.

## Frontend/backend module boundaries

Boardly stays in one repository, but frontend and backend code should be separated by import boundaries:

- `lib/client/**`: browser-only helpers used by Client Components and hooks.
- `lib/server/**`: server-only infrastructure and service entrypoints used by API routes, server components, and scripts.
- `lib/shared/**`: runtime-agnostic contracts and pure helpers that are safe on both sides.
- existing `lib/**` root modules remain compatibility entrypoints while code is migrated incrementally.

Use the dedicated aliases for new code where practical:

- `@/client/*`
- `@/server/*`
- `@/shared/*`

`npm run arch:audit` checks that Client Components do not import server-only infrastructure and server modules do not import browser-only helpers. `npm run ci:quick` runs this audit after lint and typecheck.

## Game architecture

### Base contract

All games implement `GameEngine` (`lib/game-engine.ts`) and expose:

- `validateMove(move)`
- `processMove(move)`
- `getInitialGameData()`

### Current game types in schema

`prisma/schema.prisma` enum `GameType`:

- `yahtzee`
- `tic_tac_toe`
- `rock_paper_scissors`
- `memory`
- `guess_the_spy`
- `connect_four`
- `telephone_doodle`
- `sketch_and_guess`
- `liars_party`
- `fake_artist`
- `alias`
- `other`

Game lifecycle and public availability are managed in `lib/game-catalog.ts`:

- `available` games are visible and playable in public UI.
- `in-development` games exist behind implementation or feature-flag boundaries.
- `planned` games are product direction only.

The default registered runtime set is managed in `lib/game-registry.ts`:

- Always registered: `yahtzee`, `guess_the_spy`, `tic_tac_toe`, `rock_paper_scissors`, `memory`, `connect_four`, `alias`, `liars_party`
- Feature-flagged: `telephone_doodle`, `sketch_and_guess`, `fake_artist` – read from the environment by `lib/feature-flags.ts`. `lib/runtime-config.ts` holds async versions meant to let the control panel override them without a deploy, but nothing imports those yet, so today the environment is the only switch.
- Bot-supported: `yahtzee`, `tic_tac_toe`, `rock_paper_scissors`, `memory`, `connect_four`

Registered is not the same as public: `liars_party` is registered and playable by lobby code
while its catalog state is still `in-development`.

For game launch and promotion requirements, see `docs/GAME_DEVELOPMENT.md`.

## Realtime patterns

Architecture: Supabase Realtime — no separate server process.

### Server-side broadcast

- Entry point: `lib/supabase-server.ts` → `broadcastToLobby(code, event, payload)` and `broadcastToUser(userId, event, payload)`
- Mechanism: stateless REST POST to Supabase `/realtime/v1/api/broadcast`, the payload sealed in a signed
  envelope (`lib/server/realtime-signing.ts`)
- **Must be `await`ed before returning an API response** — Vercel kills pending promises after `NextResponse.json()` returns

### Client-side subscription

- `app/lobby/[code]/hooks/useRealtimeConnection.ts` – subscribes to:
  - `lobby:{code}:{realtimeSecret}` Broadcast channel (game events), through `lib/lobby-channel-registry.ts`
  - `lobby-pg:{code}` Postgres Changes channel (lobby row changes)
- `app/lobby/use-lobby-list.ts` – global Postgres Changes on `Lobbies` table
- `app/games/components/GameLobbiesPage.tsx` – Postgres Changes on `Lobbies` per game type
- `components/SocialLoopListener.tsx` and `components/Header/NotificationsMenu.tsx` – the user's own
  `user:{userId}:{tag}` Broadcast channel (invites, rematch requests, `notification-created` pokes),
  through the registry. The tag is an HMAC of the id under a server key (`buildUserTopic`); the user
  fetches the name from `GET /api/realtime/user-topic`, which hands out only the caller's own.
- `app/lobby/[code]/spectate/page.tsx` – the lobby topic through the registry, plus
  `spectators:{code}:{realtimeSecret}` (`spectatorTopicFor`), Presence and spectator chat, client to client

All Postgres Changes subscribers run as `anon` and receive only the columns that role may select
(never `password` or `realtimeSecret`); the `supabase_realtime` publication must contain `Lobbies`
(console state, see docs/OPERATIONS.md). There is no `reactions:{code}` channel any more: it had a
listener and no sender, and rendered any payload anyone put on it (#1107).

### Signed broadcasts (GHSA-g868-9224-wr3p)

The broadcast channels are public Supabase channels: whoever knows a topic's name can send on it as
well as listen, and Supabase marks nothing that tells the server's REST broadcast from a peer's frame.
Every seated player and admitted spectator knows the lobby topic, so before this any of them could
make every other client apply a forged `game-update`, leave on a forged `game-abandoned`, or show a
`chat-message` in someone else's name. What stops it now is that receivers only believe the server:

- **The server signs.** `broadcastToChannel` seals each message into
  `{ __rt: 1, kid, iat, n, sig, p }` (`lib/shared/realtime-envelope.ts`): ECDSA P-256 over the
  canonical JSON of topic, event, key id, server time, nonce and payload. The key is derived with HKDF
  from `REALTIME_SIGNING_SECRET`, falling back to `NEXTAUTH_SECRET`, so every instance has the same key
  and nothing new is required to deploy. Without a secret nothing is sent, since nothing would be
  accepted. Canonical JSON rather than the bytes on the wire, because Supabase re-encodes the payload
  and reorders its keys.
- **The client verifies before any handler runs.** `lib/lobby-channel-registry.ts` is the only place
  a broadcast becomes a handler call, and it passes each frame through `openRealtimeMessage`
  (`lib/client/realtime-verify.ts`) in arrival order. The public key and the server clock come from
  `GET /api/realtime/key`; a message naming an unknown key id refetches it (a rotated secret), at most
  once a minute. A frame is dropped when it is unsigned, signed for another topic or event, signed by
  another key, a nonce this page has already seen, stamped more than 30 seconds before the page last
  (re)joined the topic, or stamped more than two minutes before the newest message it has accepted
  there – the last two are a genuine message recorded and played back later.
- **Peer events are the exception, and are named.** `LOBBY_PEER_EVENTS` – `sketch-live` (the drawer's
  canvas while drawing, non-authoritative and checked by `parseSketchLiveMessage`) and
  `spectator-count-update` (clamped by `readSpectatorCount`) – are the only unsigned frames a lobby
  topic delivers, and `emitWhenConnected` refuses to send anything else. Chat is not a peer event:
  Alias guesses, which used to be, go through `POST /api/lobby/[code]/alias-guess`.
- **What it does not do.** A topic holder can still send frames; they are dropped, not prevented, so a
  flood costs receivers a signature check each. The spectator topic is client to client by design,
  so spectator chat and presence are peers' claims, validated for shape and size
  (`lib/spectator-chat.ts`) and reachable only with the lobby secret. Supabase Realtime Authorization
  (private channels with `realtime.messages` policies) would stop the sending itself; it needs a
  Supabase JWT for every client, guests included, and is not in place.
- **Development over plain http.** WebCrypto exists only in a secure context, so `next dev` opened
  from a phone on the LAN cannot verify. A non-production build then accepts server envelopes
  unchecked, with a console warning; unsigned frames are still dropped. A production build has no such
  branch.

### When to use Broadcast vs Postgres Changes

- **Broadcast**: events that need immediate delivery or carry computed/sanitized payloads (game moves, chat, `player-joined` with username)
- **Postgres Changes**: structural state sync where the raw DB row is sufficient (lobby status, settings changes)

## Lobby lifecycle redirect rules

Client lifecycle handling follows one shared decision path:

- redirect immediately when game status becomes terminal (`abandoned`, `cancelled`)
- redirect when lobby is inactive and game is no longer in an active state (`waiting`, `playing`)
- always use bounded navigation (`router.replace` + timed hard fallback) to avoid stuck lobby screens

This logic is centralized in `lib/lobby-lifecycle.ts` and reused across main and dedicated lobby pages.

## Auth and identity model

### Registered users

- NextAuth session/JWT
- canonical signing secret: `NEXTAUTH_SECRET`

### Guest users

- server-issued signed guest JWT
- identity header: `X-Guest-Token`
- verification path: `lib/guest-auth.ts`, reached by most API routes through `getRequestAuthUser` in `lib/request-auth.ts` – on reads as well as writes

### Secret policy

- `NEXTAUTH_SECRET` is canonical for auth/session signing
- optional `GUEST_JWT_SECRET` can isolate guest token signing

## Data model summary

Core tables (pluralized schema):

- Identity and preferences: `Users`, `AccountPreferences`, `Bots`
- Auth/session: `Accounts`, `PasswordResetTokens`, `EmailVerificationTokens` (NextAuth runs on JWT sessions, so there is no `Sessions` table)
- Lobby/gameplay: `Lobbies`, `LobbyInvites`, `LobbyParticipations`, `Games`, `Players`, `GameStateSnapshots`
- Game content: `SpyLocations`
- Social and achievements: `FriendRequests`, `Friendships`, `UserAchievements`
- Notifications: `NotificationPreferences`, `Notifications`, `PushSubscriptions`
- Billing: `StripeWebhookEvents`, `PurchaseConsents`
- Operations/admin: `OperationalEvents`, `OperationalAlertStates`, `AdminAuditLogs`, `Feedback`, `Announcements`, `RuntimeFlags`

`prisma/schema.prisma` is the list that counts; `docs/DATABASE.md` covers ownership and RLS.

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
- Avoid hardcoded single-game behavior in shared lobby and realtime handlers.
- Prefer strict TypeScript contracts over implicit shape assumptions.
- Maintain tests for rules, scoring, reconnect, and turn transition behavior.
