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


---

# Boardly: Modular Monolith & Quality Standards

## Mission

Boardly is a platform for playing various board games online with friends. The core values are performance, accessibility, maintainability, and high code quality.

## Architectural Approach

- **Modular monolith**: Each game is implemented as a separate module under `lib/games/`, with all game-specific logic isolated.
- **Functional-declarative style**: Prefer pure functions, explicit data flow, and minimal side effects.
- **TypeScript strict**: Use strict typing, avoid `any`, and document all public interfaces.
- **Single Responsibility Principle (SRP)**: Each module/file should have one clear responsibility.
- **Testability and documentation**: All critical modules must be covered by unit/integration tests and have clear documentation.

## Key Principles

- All game logic is isolated in its own module (e.g., `lib/games/yahtzee.ts`).
- Shared interfaces for state, move validation, initial state generation, and serialization are defined in `lib/game-engine.ts`.
- Shared services (auth, lobby, chat, sync) are in dedicated modules.
- No hardcoded logic for a single game in shared handlers, API, or UI.
- All new features and fixes must follow the quality checklist below.

## Quality Checklist for Changes

- [ ] Game logic is separated into its own module
- [ ] Universal interfaces are used for game interaction
- [ ] No hardcoded logic for a specific game in shared code
- [ ] All critical modules are covered by unit/integration tests
- [ ] Public APIs and interfaces are documented
- [ ] Changes pass `npm run lint` and `npm test`
- [ ] Documentation is updated if behavior changes

## Error Detection and Refactoring

- If game logic is not separated — refactor required
- If critical parts lack tests — add coverage
- If SRP is violated — decompose into smaller modules
- All violations must be fixed according to this plan

## Verification

- Automated tests must pass
- Manual scenario checks: create game, play, finish, reconnect
- Documentation must be up to date
