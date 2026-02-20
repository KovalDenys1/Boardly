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
- `JWT_SECRET` is deprecated compatibility only
- optional `GUEST_JWT_SECRET` can isolate guest token signing

## Data model summary

Core tables (pluralized schema):

- `Users`, `Bots`
- `Lobbies`, `Games`, `Players`
- `FriendRequests`, `Friendships`
- NextAuth auth/session/token tables

Game state is persisted as JSON in `Games.state` and treated as source of truth for replay/recovery.

## Quality guardrails

- Keep game-specific logic isolated under `lib/games/` and game-specific UI blocks.
- Avoid hardcoded single-game behavior in shared lobby/socket handlers.
- Prefer strict TypeScript contracts over implicit shape assumptions.
- Maintain tests for rules, scoring, reconnect, and turn transition behavior.
