# Claude — Boardly Project Context

## Branching strategy
- `develop` — integration branch, all feature PRs merge here first
- `main` — production, only merges from `develop` via PR

## Rules for merging to main
**NEVER merge develop → main unless ALL of the following are true:**
1. All GitHub Actions checks on the `develop` branch are green (CI passes)
2. Full test suite passes: `pnpm test` shows 0 failures
3. No unresolved review comments on the PR
4. Vercel preview build for the PR has deployed successfully

To verify before merging:
```bash
pnpm test          # must be 0 failures
npm run ci:quick   # lint + typecheck + arch audit
```

## Migrations
- `prisma migrate deploy` is NOT part of the Vercel build (it hangs cross-region)
- Migrations run automatically via GitHub Actions when `prisma/migrations/` changes on develop (workflow: `.github/workflows/migrate.yml`)
- To run manually: `npm run db:migrate`

## Git hooks
- `pre-commit`: runs `git --no-pager diff --cached --check` + locale parity check
- `pre-push`: blocks direct push to main, runs db:generate + ci:quick + smoke tests

## Stack
- Next.js 16, React 19, TypeScript, Tailwind CSS
- PostgreSQL via Supabase, Prisma 7
- Auth: NextAuth, Socket.io for real-time
- Deployed on Vercel (iad1 / US East)
