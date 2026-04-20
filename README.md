# Boardly

Real-time multiplayer board games platform.

**Production:** https://boardly.online

## Stack

Next.js · TypeScript · Prisma · PostgreSQL · Socket.IO

## Architecture

- App server `:3000` — Next.js (API routes, auth, pages)
- Socket server `:3001` — Socket.IO (real-time lobby/game events)
- Database — PostgreSQL via Supabase + Prisma

## Games

Yahtzee · Guess the Spy · Tic-Tac-Toe · Rock Paper Scissors

## Quick start

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:push
npm run dev:all
```
