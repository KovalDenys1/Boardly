# Boardly

Real-time multiplayer board games platform.

**Live:** https://boardly.online

## Stack

Next.js · TypeScript · PostgreSQL · Prisma · Socket.IO · Supabase

## Architecture

- App server `:3000` — Next.js (API, auth, pages)
- Socket server `:3001` — Socket.IO (lobby, game events)
- Database — PostgreSQL via Supabase + Prisma

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:generate && npm run db:push
npm run dev:all
```

## Scripts

```bash
npm run dev:all     # start both servers
npm run build       # production build
npm run test        # run tests
npm run db:migrate  # run migrations
npm run db:studio   # open Prisma Studio
```

## Games

Yahtzee · Guess the Spy · Tic-Tac-Toe · Rock Paper Scissors
