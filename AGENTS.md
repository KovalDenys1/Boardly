# Boardly Agent Guide (Codex)

Use this file to work effectively in this repository with minimal regressions.

## Mission

Improve Boardly as a reliable real-time multiplayer platform with strong game integrity, sync correctness, and operational safety.

## Read First (for non-trivial tasks)

- `README.md`
- `.github/copilot-instructions.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/SECURITY_MODEL.md`

## Architecture Snapshot

- Next.js app server (HTTP API/auth/pages): `:3000`
- Socket.IO realtime server: `socket-server.ts` (`:3001`)
- PostgreSQL + Prisma

Core flow:
`Client action -> API route -> DB update -> notify socket server -> room broadcast -> client reconcile`

## High-Risk Areas (read before editing)

- `socket-server.ts`
- `lib/socket/handlers/*`
- `app/lobby/[code]/hooks/useSocketConnection.ts`
- `app/api/game/[gameId]/state/route.ts`
- `lib/game-engine.ts`
- `lib/games/*`
- `lib/guest-auth.ts`
- auth routes under `app/api/auth/*`

## Non-Negotiables

- Server-authoritative gameplay: client may be optimistic, server snapshots win.
- Use `NEXTAUTH_SECRET` as the primary signing secret; do not introduce new `JWT_SECRET`-based logic.
- Guest identity must use signed tokens (`X-Guest-Token`), not raw client IDs.
- Be defensive around reconnects, duplicate events, and timer/auto-action paths.
- Keep changes minimal and readable; avoid broad refactors unless requested.

## Fast Command Cookbook

Setup:

- `npm install`
- `npm run db:generate`
- `npm run db:push`

Run locally:

- `npm run dev:all` (preferred)
- `npm run dev`
- `npm run socket:dev`

Quality checks:

- `npm run ci:quick` (lint + typecheck)
- `npm test`
- `npm run ready:build-test` (full local gate)

Operational checks:

- `npm run check:env`
- `npm run check:db`
- `npm run ops:alerts:check`
- `npm run ops:kpi:report`

## Verification Matrix (run what matches your change)

UI-only:

- `npm run lint`
- relevant Jest tests if components/hooks changed

API / auth / guest flow:

- `npm run ci:quick`
- `npm test`
- manual guest join/play smoke test if behavior changed

Realtime / socket / game engine:

- `npm run ci:quick`
- `npm test`
- manual flow: create/join/start/play/reconnect/finish

DB / Prisma / RLS:

- `npm run db:validate`
- `npm run db:generate`
- `npm run db:rls:smoke` (when relevant)

## Codex Automation (MCP)

This repo includes Windows-friendly MCP wrappers for Codex:

- `scripts/mcp-github.ps1`
- `scripts/mcp-postgres.ps1`
- `scripts/mcp-filesystem.ps1`
- `scripts/mcp-memory.ps1`
- `scripts/codex-mcp-setup.ps1`
- `scripts/codex-mcp-health-check.ps1`

First-time setup (registers MCP servers in `~/.codex/config.toml`):

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-mcp-setup.ps1`

Expected MCP server names:

- `boardly-github`
- `boardly-postgres`
- `boardly-filesystem`
- `boardly-memory`

Requirements:

- `GITHUB_TOKEN` (or `GITHUB_PERSONAL_ACCESS_TOKEN`) in `.env` / `.env.local`
- `DATABASE_URL` in `.env` / `.env.local`
- `MCP_POSTGRES_CA_CERT_PATH` in `.env` / `.env.local` for strict TLS trust (path to CA PEM/CRT file)

External MCP scaffold template (not auto-registered):

- `docs/codex-mcp.external-template.toml`

## Owner Preferences (Codex Collaboration Defaults)

Use these defaults unless the user overrides them in the current chat.

- Autonomy: balanced (ask before important behavior/config changes; proceed on small safe edits).
- Questions: ask in batches with options when configuring tools/files.
- Auto-approve profile: medium (read-only + common quality commands).
- Quick-check default: working (`env + db + ci:quick + smoke tests`).
- Env output preference: quiet (do not print env values/prefixes during checks).
- VS Code tasks: keep basic one-click tasks available.
- When tradeoffs exist: propose 2-3 variants before editing.

## Codex IDE Workflows

Use these as default automation routines when the task does not require something custom.

Quick local confidence pass (recommended before/after non-trivial edits):

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-quick-check.ps1`

Skip DB when working offline / DB is unavailable:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-quick-check.ps1 -SkipDb`

Notes:

- `codex-quick-check` uses quiet env checking by default (`npm run check:env:quiet`).

Full pre-PR local gate:

- `npm run ready:build-test`

Refresh Codex MCP registration (after script/path changes):

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-mcp-setup.ps1 -Force`

MCP health check (detailed local sanity):

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/codex-mcp-health-check.ps1`

Suggested Codex task prompts (examples):

- "Investigate this realtime bug with minimal diff, run `npm run ci:quick` and only relevant tests."
- "Implement feature X and update tests for changed behavior; avoid broad refactors."
- "Trace guest auth flow end-to-end and verify `NEXTAUTH_SECRET`-based token logic only."

## Working Style for Agents

- Prefer targeted reads (`rg`, specific files) before editing.
- Preserve existing patterns (Next.js app router, Prisma, socket handler structure).
- Do not create one-off docs unless requested; update canonical docs when behavior changes.
- For bug fixes, add/adjust tests near the changed behavior when practical.
- Never expose secrets from `.env` in outputs or commits.

## Good Entry Points by Task Type

New API behavior:

- `app/api/**/route.ts`
- `lib/*` service/helper used by route
- `__tests__/api/*`

Realtime bug:

- `socket-server.ts`
- `lib/socket/handlers/*`
- `__tests__/socket/*`

Game logic:

- `lib/games/*`
- `lib/game-engine.ts`
- `__tests__/lib/games/*`

Lobby UX/state sync:

- `app/lobby/[code]/hooks/*`
- `app/lobby/[code]/components/*`
- `__tests__/app/*`, `__tests__/socket/*`
