# Database

## Connection string parameters

The credential itself lives in `.env.local` and in Vercel. What is *not* duplicated anywhere
else is production's pool tuning, so it is written down here rather than only in a file that
gets deleted:

```
DATABASE_URL=…?pgbouncer=true&sslmode=require&statement_cache_size=0&connection_limit=10&pool_timeout=20
```

`DATABASE_URL` uses the transaction-mode pooler on port **6543**; `DIRECT_URL`, which only
migrations use, is the session-mode pooler on **5432** and carries `sslmode=require` alone.

`boardly-dev` (`inmvbxfflqeblynpktay`, eu-central-2) sits on the **`aws-0`** pooler, production
(`vamydthjlytrseqdpzqv`) on **`aws-1`** — they are not interchangeable, and assuming they were
cost an afternoon on 2026-09-07.

## Which database local development talks to

`.env.local` points at **`boardly-dev`** since 2026-09-09 (#893). Before that it was
production, which is how the e2e suite left 383 orphan participation rows and 225 guests in
the live database for #867 to delete by hand, and how 21 of the 39 games recorded on
2026-09-06 turned out to be a QA sweep rather than players.

Four variables decide this and they move together — `DATABASE_URL`, `DIRECT_URL`,
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Switching only the two
Postgres URLs is worse than switching none: Prisma writes to dev while the realtime channels
stay on production, so nothing the page subscribes to ever fires.

`SUPABASE_SERVICE_ROLE_KEY` is the one value no tool can read back — not the Supabase MCP,
not `vercel env pull`. It has to be copied from
`https://app.supabase.com/project/inmvbxfflqeblynpktay/settings/api` by hand; until it is,
realtime broadcast and avatar upload fail locally while everything Prisma does works. Done
as of 2026-09-20: the key in `.env.local` now decodes (JWT payload, `ref` claim) to
`inmvbxfflqeblynpktay`, matching the other four variables.

The production values are parked in `.env.boardly-prod.local` (mode 600, gitignored) so
switching back is a copy, not a hunt.

## Vercel variable types (settled 2026-09-07)

| Variable | Production / Preview | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config, readable | Inlined into the client bundle; hiding it from yourself buys nothing |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config, readable | Same |
| `DATABASE_URL` | **Secret**, write-only | Full database access |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret**, write-only | Bypasses RLS entirely |

Secret means Vercel never returns the value again — not in the dashboard, not in
`vercel env pull`. Keep your own copy; `.env.local` is it. Development cannot be made
sensitive: Vercel rejects it server-side.

`vercel env add` defaults to **sensitive on Production and Preview**. Pass `--no-sensitive`
when the value is meant to stay readable.
