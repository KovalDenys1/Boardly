# Boardly

Boardly is a real-time multiplayer board games platform built with Next.js, TypeScript, Prisma, PostgreSQL, and a standalone Socket.IO server.

Production: <https://boardly.online>

## What this repository contains

- Next.js app (HTTP API, auth, pages)
- Socket.IO server (`socket-server.ts`) for real-time lobby/game events
- Shared game engine abstractions (`lib/game-engine.ts`)
- Game implementations (Yahtzee, Guess the Spy, Tic-Tac-Toe, Rock Paper Scissors)

## Architecture at a glance

- App server: `:3000` (Next.js)
- Socket server: `:3001` (Socket.IO)
- Database: PostgreSQL (Supabase + Prisma)

Flow:
`Client action -> API route -> DB update -> notify socket server -> room broadcast -> client reconcile`

## Quick start

### 1) Install

```bash
npm install
```

### 2) Configure environment

```bash
cp .env.example .env.local
```

Fill required values in `.env.local`.

Important:

- Use `NEXTAUTH_SECRET` as the single signing secret for auth/session tokens.
- `JWT_SECRET` is deprecated and should not be used for new logic.
- Guest authentication uses signed guest JWTs (`X-Guest-Token`).

### 3) Prepare database

```bash
npm run db:generate
npm run db:push
```

### 4) Start development

```bash
npm run dev:all
```

Or run separately:

```bash
npm run dev
npm run socket:dev
```

## Common scripts

```bash
npm run dev            # Next.js
npm run socket:dev     # Socket.IO server
npm run dev:all        # both
npm run build          # prisma generate + next build
npm run test
npm run lint
npm run db:generate
npm run db:push
npm run db:migrate
```

## Documentation map

- Project docs index: `docs/README.md`
- Product direction: `docs/PROJECT_VISION.md`
- System design and data flows: `docs/ARCHITECTURE.md`
- Local/prod operations and deployment: `docs/OPERATIONS.md`
- Current roadmap: `docs/ROADMAP.md`
- Contribution workflow: `docs/CONTRIBUTING.md`
- Security model details: `docs/SECURITY_MODEL.md`
- AI agent instructions: `.github/copilot-instructions.md`

## Community and policy

- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- License: `LICENSE`
