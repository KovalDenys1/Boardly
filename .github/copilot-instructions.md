# Boardly AI Agent Instructions

Use this file as the execution guide for automated contributors.

## Mission

Improve Boardly as a reliable real-time multiplayer platform with minimal regressions in game integrity, sync, and security.

## Canonical docs

Read these first before major changes:

- `README.md`
- `docs/PROJECT_VISION.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/ROADMAP.md`
- `docs/CONTRIBUTING.md`
- `docs/SECURITY_MODEL.md`

## Current architecture

- Next.js app server: API/auth/pages (`:3000`)
- Socket.IO realtime server: `socket-server.ts` (`:3001`)
- PostgreSQL + Prisma (pluralized schema tables)

State flow:
`Client action -> API route -> DB update -> notify socket server -> room broadcast -> client reconcile`

## Non-negotiable rules

- **Server-authoritative gameplay**: optimistic UI is allowed, but final state must reconcile from server snapshots. Do not rely on client-only timer/action decisions.
- **Auth and guest identity**: use `NEXTAUTH_SECRET` as primary signing secret. `JWT_SECRET` is deprecated; do not introduce new logic based on it. Guest identity must use signed tokens (`X-Guest-Token`), not raw client IDs/names.
- **Realtime robustness**: protect timer/auto-action paths against duplicate processing, handle reconnect/out-of-order events defensively, and advance turn safely when the current player disconnects.
- **Code quality**: keep TypeScript strictness and minimal readable changes. Keep comments in English and never put secrets in code or docs.

## High-priority areas when touching code

- `socket-server.ts` (connection lifecycle, room events, turn integrity)
- `app/lobby/[code]/hooks/useSocketConnection.ts` (client sync/reconnect)
- `app/api/game/[gameId]/state/route.ts` (move validation/state transitions)
- `lib/game-engine.ts` + `lib/games/*` (game correctness)
- `lib/guest-auth.ts` + auth routes (identity and token validation)

## Adding a new game

Minimum required path:

1. Add game engine class in `lib/games/` extending `GameEngine`.
2. Register game type in `prisma/schema.prisma` and lobby creation API.
3. Add board UI and lobby routing integration.
4. Add translations in `locales/en.ts` and `locales/uk.ts`.
5. Add unit tests in `__tests__/lib/games/`.
6. Update relevant docs if architecture/workflow changed.

## Testing and verification

Before finalizing changes:

```bash
npm run lint
npm test
```

For realtime/auth changes, also manually verify:

- create/join/start/finish game flow
- reconnect after disconnect
- guest join/play flow
- no duplicate auto-actions on turn timeout

## Deployment guardrails

- Do not run migrations in socket service build.
- Keep migration execution in a dedicated deploy step/job.
- Ensure env vars are configured for both app and socket services.

## Documentation discipline

When behavior changes, update canonical docs only. Avoid creating one-off "summary/fix" markdown files unless explicitly requested.
