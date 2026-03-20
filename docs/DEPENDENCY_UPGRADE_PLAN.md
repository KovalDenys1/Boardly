# Dependency Upgrade Plan

Last verified: 2026-03-13

This document is the canonical dependency maintenance plan for Boardly. It separates low-risk patch waves from major framework and ORM migrations that need dedicated branches and manual smoke coverage.

Version checks in this document were verified against:

- current installed versions in this repository
- `npm view <package> version`
- `npm audit`
- official upgrade guides from Prisma, Next.js, React, Tailwind CSS, and ESLint

## Current snapshot

| Package group | Current | Latest verified | Track | Notes |
| --- | --- | --- | --- | --- |
| `@prisma/client` + `prisma` | `5.22.0` | `7.4.2` | major | Blocked by Prisma 7 migration work in [`lib/db.ts`](../lib/db.ts) and CLI config changes |
| `next` | `16.1.6` | `16.1.6` | aligned | Version bump landed; remaining work is migration cleanup and verification |
| `react` + `react-dom` | `19.2.4` | `19.2.4` | aligned | Version bump landed with the Next 16 migration wave |
| `socket.io` + `socket.io-client` | `4.8.3` | `4.8.3` | patch | Completed on 2026-03-09 |
| `@sentry/nextjs` | `10.42.0` | `10.42.0` | minor | Completed on 2026-03-09 |
| `react-i18next` | `16.5.6` | `16.5.6` | minor | Completed on 2026-03-09 |
| `i18next` | `25.8.16` | `25.8.16` | minor | Completed on 2026-03-09 |
| `resend` | `6.9.3` | `6.9.3` | minor | Completed on 2026-03-09 |
| `dotenv` | `17.3.1` | `17.3.1` | patch | Completed on 2026-03-09 |
| `tailwindcss` | `3.4.14` | `4.2.1` | major | Separate migration; config and CSS pipeline change |
| `zod` | `3.23.8` | `4.3.6` | major | Wide validation surface across auth, env, and lobby APIs |
| `eslint` | `9.39.4` | `10.0.3` | major | Flat config is in place; ESLint 10 remains a separate toolchain wave |
| `lefthook` | `1.13.6` | `2.1.3` | major | Separate hook config migration |

## Audit status

`npm audit` is clean as of 2026-03-09.

Completed on 2026-03-09:

1. Wave 0 tooling cleanup for MCP and markdown tooling (`#196`)
2. Wave 1 low-risk runtime upgrades (`#197`)

Remaining work is now limited to the major/framework waves below.

## Repo-specific blockers

### Prisma 7

- [`lib/db.ts`](../lib/db.ts) still uses `prisma.$use(...)` middleware for retry and timeout handling. Prisma 6 deprecated middleware in favor of Client extensions and query extensions, and Prisma 7 removes more legacy paths.
- Package scripts still hardcode `--schema prisma/schema.prisma`. Prisma 7 uses `prisma.config.ts` as the CLI configuration entry point.
- Prisma 7 requires an explicit generator `output` path instead of relying on the old default location.
- CI already runs Node 20, but [`docs/LOCAL_SETUP.md`](./LOCAL_SETUP.md) and [`docs/OPERATIONS.md`](./OPERATIONS.md) still state `Node.js 18+`. Those docs must be updated when the Prisma/Next upgrade actually lands.

### Next 16 + React 19

- [`next.config.js`](../next.config.js) contains a custom `webpack` hook. Next 16 uses Turbopack by default for `next build`, and the official upgrade guide says builds fail when a custom webpack config is still present unless the project explicitly stays on `--webpack` or migrates the config.
- The repo now uses [`proxy.ts`](../proxy.ts), but the remaining Next 16 cleanup still needs deliberate verification under the Node.js proxy runtime.
- The async request API migration is mostly in good shape already:
  - `params` and `searchParams` are already typed as `Promise<...>` in many App Router files
  - `cookies()` usage in [`lib/next-auth.ts`](../lib/next-auth.ts) is already awaited
- There are no App Router parallel route slots (`app/@...`) in the current tree, so the new `default.js` requirement is not a blocker here.

### Tailwind 4

- The repo currently uses [`tailwind.config.ts`](../tailwind.config.ts), [`postcss.config.js`](../postcss.config.js), and `@tailwind base/components/utilities` in [`app/globals.css`](../app/globals.css).
- Tailwind 4 changes the configuration and PostCSS integration model, so this should stay isolated from the Next 16 migration.

### Zod 4

- `zod` is used in auth, env validation, lobby routes, and multiple game validators.
- The repo also relies on `ZodError` formatting and helper mapping in [`lib/validation/auth.ts`](../lib/validation/auth.ts) and [`lib/error-handler.ts`](../lib/error-handler.ts).
- Recommended path: move to the latest `3.25.x` first, then evaluate `4.x` in a separate PR.

### ESLint 10 and Lefthook 2

- The repo now uses flat ESLint config in [`eslint.config.mjs`](../eslint.config.mjs) on ESLint 9 to stay compatible with `eslint-config-next@16`.
- ESLint 10 is still a separate follow-up because it should be validated independently from the Next 16 migration wave.
- Lefthook 2 should be treated as a separate hook-config migration, not bundled into app-runtime changes.

## Recommended execution order

### Wave 0: development tooling audit cleanup

Status: completed on 2026-03-09 via `#196`

Scope:

- update MCP server packages that still pull old `@modelcontextprotocol/sdk`
- update `markdownlint-cli`
- re-run `npm audit`

Reason:

- this clears current local tooling advisories without touching app runtime behavior

### Wave 1: low-risk runtime patch and minor upgrades

Status: completed on 2026-03-09 via `#197`

Scope:

- `socket.io` + `socket.io-client` `4.8.1 -> 4.8.3`
- `@sentry/nextjs` `10.27.0 -> 10.42.0`
- `react-i18next` `16.3.5 -> 16.5.6`
- `i18next` `25.6.3 -> 25.8.15`
- `resend` `6.1.3 -> 6.9.3`
- `dotenv` `17.2.3 -> 17.3.1`

Reason:

- these are the safest updates and should happen before any major migration

### Wave 2: Prisma 5 -> 7 preparation and upgrade

Scope:

- replace `prisma.$use(...)` middleware in [`lib/db.ts`](../lib/db.ts) with Prisma Client extensions / query extensions
- add `prisma.config.ts`
- add explicit client generator `output`
- upgrade `prisma` and `@prisma/client`
- update local docs from Node 18+ to the actual required minimum once the upgrade is confirmed

Reason:

- Prisma touches the entire persistence layer and must be isolated from framework upgrades

### Wave 3: Next 16 + React 19

Scope:

- run the official Next 16 codemod
- decide whether to keep `next build --webpack` temporarily or migrate the custom webpack logic in [`next.config.js`](../next.config.js)
- keep [`proxy.ts`](../proxy.ts) aligned with Next 16 Node.js proxy runtime behavior during verification
- upgrade `next`, `react`, `react-dom`, `@types/react`, and `@types/react-dom`

Reason:

- Next 16 and React 19 should move together; the official guide treats them as one upgrade step

### Wave 4: isolated major migrations

Scope:

- `tailwindcss` 3 -> 4
- `zod` 3 -> 4
- `eslint` 8 -> 10
- `lefthook` 1 -> 2

Reason:

- each of these changes a different part of the toolchain and should not be bundled into the ORM or framework waves

## Verification gate for every wave

Run the smallest gate that still matches the risk level. For Prisma and Next waves, do the full gate.

- `npm install`
- `npm audit`
- `npm run ci:quick`
- `npm test`
- `npm run ready:build-test`
- manual smoke: register, login, guest join, create lobby, start game, reconnect once, finish game

For the Next 16 wave, add:

- `npm run dev:all`
- browser smoke of key routes in a real browser
- focused check of admin pages, auth pages, and lobby/game flow

## Official references

- Prisma ORM 7 upgrade guide: <https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7>
- Next.js 16 upgrade guide: <https://nextjs.org/docs/app/guides/upgrading/version-16>
- React 19 release post: <https://react.dev/blog/2024/12/05/react-19>
- Tailwind CSS v4 upgrade guide: <https://tailwindcss.com/docs/upgrade-guide>
- ESLint migration guide: <https://eslint.org/docs/latest/use/configure/migration-guide>
