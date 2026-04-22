# Dependency Upgrade Plan

Last repository audit: 2026-04-22

This document is the dependency maintenance plan for Boardly. It is intentionally repository-aligned: use `package.json`, `package-lock.json`, and official package release notes when preparing a new upgrade branch. Do not treat this page as a live registry of the newest package versions.

## Current repository snapshot

| Package group | Repo version | Status | Notes |
| --- | --- | --- | --- |
| `next` | `^16.1.6` | aligned | App Router + `proxy.ts`; verify any routing/runtime changes with browser smoke tests |
| `react` + `react-dom` | `^19.2.4` | aligned | Keep React upgrades coupled to the Next.js compatibility matrix |
| `prisma` + `@prisma/client` | `^7.4.2` | aligned | Uses `prisma.config.ts`, explicit generator output, and `@prisma/adapter-pg` |
| `@prisma/adapter-pg` | `^7.4.2` | aligned | Runtime TLS behavior is documented in `docs/OPERATIONS.md` |
| `socket.io` + `socket.io-client` | `^4.8.3` | aligned | Realtime upgrades require reconnect and room-broadcast smoke coverage |
| `@sentry/nextjs` | `^10.42.0` | aligned | Verify release monitoring after bumps |
| `resend` | `^6.9.3` | aligned | Keep email behavior smoke-tested when touched |
| `tailwindcss` | `3.4.14` | major follow-up | Tailwind 4 needs a dedicated styling/tooling migration |
| `zod` | `3.23.8` | major follow-up | Zod 4 touches env validation, auth validation, lobby APIs, and game payload schemas |
| `eslint` | `^9.39.4` | watch | Flat config is already in place; future major upgrades should stay isolated |
| `lefthook` | `^1.13.6` | major follow-up | Treat hook runner upgrades as tooling-only PRs |

## Completed migration state

The previous high-risk framework and ORM upgrades have landed:

- Prisma 7 is active.
- Next.js 16 and React 19 are active.
- Node.js 20.19+ is the documented local/runtime baseline.
- Prisma client generation uses explicit output through `prisma.config.ts`.
- Runtime DB access uses the Prisma PostgreSQL adapter path in `lib/db.ts`.

## Remaining upgrade tracks

### Tailwind CSS 4

- Current project still uses `tailwind.config.ts`, `postcss.config.js`, and `@tailwind base/components/utilities` in `app/globals.css`.
- Tailwind 4 changes the CSS/config/PostCSS model, so keep it separate from app runtime changes.
- Verification should include representative desktop/mobile screenshots for lobby, games, auth pages, admin pages, and shared UI primitives.

### Zod 4

- `zod` is used across env parsing, auth validation, lobby/game APIs, and game-specific validators.
- Audit `ZodError` formatting and helper mappings before upgrading.
- Recommended path: land compatibility cleanup first, then upgrade in a dedicated PR with focused API/auth/game validation tests.

### Tooling majors

- ESLint upgrades should be tested with `npm run lint`, `npm run typecheck`, and the Next.js ESLint compatibility matrix.
- Lefthook upgrades should be limited to hook installation/config behavior and verified with `npm run hooks:pre-commit` and `npm run hooks:pre-push`.

## Upgrade workflow

For each upgrade wave:

1. Create a dedicated branch from `develop` and link the ticket in the commit message.
2. Check current installed versions with `npm outdated` or targeted `npm view <package> version`.
3. Read official release/upgrade notes for breaking changes.
4. Keep unrelated dependency bumps out of the same PR unless they are required by the upgrade.
5. Update docs only when behavior, commands, runtime requirements, or environment expectations change.

## Verification gate

Use the gate that matches the risk level:

- Small patch/minor dependency: `npm run ci:quick` and relevant tests.
- Prisma/DB dependency: `npm run db:validate`, `npm run db:generate`, `npm run db:rls:smoke`, `npm run check:db`, plus relevant API smoke coverage.
- Next/React/runtime dependency: `npm run ci:quick`, `npm test`, `npm run ready:build-test`, plus browser smoke for register/login, guest join, create lobby, start game, reconnect, finish game.
- Styling/tooling dependency: `npm run lint`, `npm run typecheck`, relevant UI checks, and hook commands if hook config changed.

## Official references

- Prisma ORM upgrade guides: <https://www.prisma.io/docs/orm/more/upgrade-guides>
- Next.js upgrade guides: <https://nextjs.org/docs/app/guides/upgrading>
- React release blog: <https://react.dev/blog>
- Tailwind CSS upgrade guide: <https://tailwindcss.com/docs/upgrade-guide>
- Zod release notes: <https://github.com/colinhacks/zod/releases>
- ESLint migration guides: <https://eslint.org/docs/latest/use/migrate-to-latest-version>
