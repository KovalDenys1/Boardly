# Architecture

## System topology

Boardly uses a dual-server model:

- Next.js app server (`:3000`): API routes, auth, pages, SSR.
- Socket.IO server (`:3001`): realtime room events, connection lifecycle, presence.
- PostgreSQL (Supabase) via Prisma.

## Authoritative state flow

1. Client sends action to API route.
2. API validates actor + move + game rules.
3. API updates persisted game state in DB.
4. API notifies socket server (`/api/notify`).
5. Socket server broadcasts state update to room.
6. Clients reconcile UI with server snapshot.

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
- deduplication on noisy reconnect bursts
- room-based broadcasting (`lobby:<code>`)
- disconnect handling with turn advancement for disconnected active players

## Auth model

### Registered users

- NextAuth session/JWT.
- Signing secret: `NEXTAUTH_SECRET`.

### Guest users

- Guest sessions are server-issued signed JWTs.
- Header for API/socket identity: `X-Guest-Token`.
- Verification path: `lib/guest-auth.ts` + socket auth middleware.

### Secret policy

- `NEXTAUTH_SECRET` is canonical for auth/session signing.
- `JWT_SECRET` is deprecated compatibility only.
- Optional `GUEST_JWT_SECRET` can isolate guest token signing.

## Data model summary

Core tables (pluralized schema):

- `Users`, `Bots`
- `Lobbies`, `Games`, `Players`
- `FriendRequests`, `Friendships`
- NextAuth-related auth/session/token tables

Game state is persisted as JSON in `Games.state` and treated as source of truth for replay/recovery.

## Failure modes to design for

- Socket cold starts on free infrastructure.
- Client/server timer race conditions.
- Duplicate/late events after reconnect.
- Mid-turn disconnects.

Mitigation direction:

- idempotent server actions
- turn-ended guards before auto-actions
- server-side debounce for timer-triggered actions
- forced state resync after reconnect or failed optimistic actions
