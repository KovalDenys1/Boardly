# Roadmap

Direction only, rewritten 2026-09-15. Execution tracking lives in GitHub Issues and the
project board; if this page and an issue disagree, the issue wins.

## Done, so no longer a direction

These were the roadmap for the first half of 2026 and have shipped. They are listed so the
page cannot be read as though they were still ahead:

- Socket.IO replaced by Supabase Realtime (Broadcast + Postgres Changes), with reconnect
  telemetry, SLOs and alert rules – `docs/REALTIME_TELEMETRY.md`.
- RLS rolled out, with a role bootstrap in `npm run db:migrate` and `npm run db:rls:smoke`.
- Guest identity is signed-token only (`X-Guest-Token`).
- Spectators, replays, notifications and web push.
- Monetization: Stripe Premium, monthly and yearly, on `/premium`.
- Seven games available. Four more are built but `in-development`: three behind an
  `ENABLE_*` flag, and Liar's Party, which is always registered and reachable by lobby
  code.

## Current direction

### Catalog

- Promote the `in-development` games one at a time. Built is not the same as promoted:
  promotion is a product decision, and the checklist is `docs/GAME_DEVELOPMENT.md`. Note
  that Liar's Party has no feature flag, so promoting it is a catalog edit, not a flag
  flip.
- New games stay inside the shared `GameEngine`, lobby and `components/game-chrome/` kit.

### Reach

- SEO: each game page answers the query it targets, and the guides carry the long tail.
- Discord as the place players find each other, with the site and the server linked both ways
  (`docs/DISCORD.md`).

### Quality

- Shrink `scripts/responsive-audit-baseline.json` rather than grow it; the real-device check
  stays the final gate for game boards (`docs/RESPONSIVE.md`).
- Keep the bundle budget green on `/lobby/[code]` (`docs/PERFORMANCE_BUNDLE_BUDGET.md`).
- Dependency majors still outstanding: Tailwind 4 and Zod 4
  (`docs/DEPENDENCY_UPGRADE_PLAN.md`).

## Backlog direction

- More casual games with short session loops.
- Re-engagement loops that do not depend on notifications people mute.
- Ads on content pages only, once AdSense approval and a paid Vercel plan are both settled –
  never in or near a game.
