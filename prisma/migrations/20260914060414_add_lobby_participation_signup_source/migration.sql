-- ============================================================================
-- Migration: signupSource on LobbyParticipations
-- Date: 2026-09-14
-- Description:
--   `Users.signupSource` answers "where did this player come from", and guests
--   carry nearly all of it: on 2026-09-13, twenty of the thirty-one live guests
--   had a source against seven of the hundred and twenty-five registered
--   accounts. But a guest is hard-deleted after three idle days, so that answer
--   is destroyed three days after the visit it describes.
--
--   `LobbyParticipations` already survives the purge by design (no relation to
--   `Users`) and already carries `gameType`, so it is the one place where
--   "which source produced a player, and what did they play first" can still be
--   asked a month later. The column is nullable because the source itself is:
--   a visitor with cookies blocked has none, and a guess would be worse.
--
--   Rejected alternative: aggregating in scripts/cleanup-old-guests.ts before
--   the delete. That yields counts only and couples analytics to a destructive
--   path, so a bug there loses data instead of a number.
-- ============================================================================

ALTER TABLE "LobbyParticipations" ADD COLUMN IF NOT EXISTS "signupSource" VARCHAR(120);

CREATE INDEX IF NOT EXISTS "LobbyParticipations_signupSource_joinedAt_idx"
  ON "LobbyParticipations" ("signupSource", "joinedAt");
