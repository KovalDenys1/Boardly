# Contributing

## Development setup

For the full local-only workflow, see `docs/LOCAL_SETUP.md`.

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:push
npm run dev:all
```

## Workflow

1. Pick a GitHub Issue.
2. Create a dedicated branch from `develop` (`feature/*`, `fix/*`, or `chore/*`).
3. Implement with tests.
4. Run verification commands.
5. Open PR into `develop` with issue reference.
6. Release via PR from `develop` to `main` (no direct pushes to protected branches).
7. After PR merge, delete the local task branch (`git branch -d <branch>`). Remote source branches are auto-deleted by repository settings.

## Verification commands

```bash
npm run lint
npm test
npm run check:locales
```

For significant backend or schema changes, also run:

```bash
npm run build
npm run db:rls:smoke
```

## Engineering standards

- TypeScript-first, avoid `any` unless justified.
- Keep business logic in `lib/`, UI in `components/` and `app/`.
- Keep socket event names/types centralized in `types/socket-events.ts`.
- Keep server-authoritative reconciliation after moves.
- Keep comments and documentation in English.
- For new PostgreSQL server timestamps, prefer `TIMESTAMPTZ` (via explicit SQL in Prisma migrations when needed).

## Adding a new game (minimal checklist)

1. Implement game class extending `GameEngine` in `lib/games/`.
2. Add game type support in `prisma/schema.prisma` and lobby create API.
3. Add UI board/page integration in lobby flow.
4. Add translations (`locales/en.ts`, `locales/uk.ts`, and other active locales).
5. Add unit tests for game logic.
6. Update docs if architecture/workflow changed.

## Security policy for contributors

- Never commit secrets (`.env`, `.env.local`).
- Use `NEXTAUTH_SECRET` for auth/session signing logic.
- Guest identity must use signed token flow (`X-Guest-Token`), not raw client IDs.
