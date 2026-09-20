-- Backfill the move clock on games started before #1048.
--
-- "Games"."lastMoveAt" is declared @default(now()), so it was seeded when the
-- WAITING row was created and it held a lobby timestamp. The waiting -> playing
-- update in app/api/game/create/route.ts wrote "startedAt" and left the seeded
-- value alone, so every game started before that route was fixed carries a move
-- clock reading earlier than its own start.
--
-- Setting it to "startedAt" is the correct value, not a cosmetic one. A row whose
-- move clock predates its start had no move accepted: GameEngine.makeMove stamps
-- state.lastMoveAt on every accepted move, the state route persists it to this
-- column, and no engine subclass overrides makeMove. So the true play time for
-- these rows is zero seconds, which "lastMoveAt" = "startedAt" records.
--
-- Two things need this run:
--
-- 1. The ticket's numbers. "lastMoveAt" - "startedAt" is read as seconds of real
--    play, and for these rows it is the negated time the lobby sat open - that is
--    where tic_tac_toe's "minus 1s median" came from. Left alone, every historical
--    row keeps dragging that figure negative however the code behaves from now on.
-- 2. The recurrence counter added to lib/lobby-health.ts in the same change. It
--    counts playing games whose move clock is strictly before their start. Without
--    this backfill it would read above zero on first deploy for purely historical
--    reasons and never fall to zero, so it could never signal a recurrence - the
--    one thing it exists to do.
--
-- Safe against rows that did see play: "startedAt" is written in exactly one place
-- (the waiting -> playing update) and is never rewritten, so there is no restart
-- path that could move a start ahead of a genuine move and make a played game look
-- like this.
--
-- Deliberately raw SQL rather than a Prisma update: @updatedAt is applied by the
-- Prisma client, not by the database, so this leaves "updatedAt" alone. Bumping it
-- would make every backfilled row look freshly touched to the idle sweep in
-- lib/lobby-health.ts, which tests "updatedAt" on its own unbounded branch.
UPDATE "Games"
SET "lastMoveAt" = "startedAt"
WHERE "startedAt" IS NOT NULL
  AND "lastMoveAt" < "startedAt";
