# Contributing

## Development setup

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:push
npm run dev:all
```

## Workflow

1. Pick a GitHub Issue.
2. Create a branch.
3. Implement with tests.
4. Run `npm run lint && npm test`.
5. Open PR with issue reference.

## Engineering standards

- TypeScript-first, avoid `any` unless justified.
- Keep business logic in `lib/`, UI in `components/`/`app/`.
- Keep socket event names/types centralized in `types/socket-events.ts`.
- Use server-authoritative reconciliation after moves.
- Comments and docs in English.

## Adding a new game (minimal checklist)

1. Implement game class extending `GameEngine` in `lib/games/`.
2. Add game type support in `prisma/schema.prisma` and lobby create API.
3. Add UI board/page integration in lobby flow.
4. Add translations (`locales/en.ts`, `locales/uk.ts`).
5. Add unit tests for game logic.
6. Update docs if architecture/workflow changed.

## Testing policy

- Required before PR merge: `npm test`, `npm run lint`.
- For game changes: include focused tests in `__tests__/lib/games/`.
- For realtime changes: manually verify reconnect/disconnect and turn transition behavior.

## Security policy for contributors

- Never commit secrets (`.env`, `.env.local`).
- Prefer `NEXTAUTH_SECRET` for auth/session signing logic.
- Guest identity must use signed token flow (`X-Guest-Token`), not raw client IDs.
