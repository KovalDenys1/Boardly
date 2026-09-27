-- ============================================================================
-- Migration: Games.pseudonymisedAt, Lobbies.pseudonymisedAt
-- Date: 2026-09-28
-- Description:
--   #1130, decision 2026-09-27: a finished game is no longer deleted when its
--   retention period ends. Its player names, messages and drawings are
--   replaced (lib/game-pseudonymisation.ts), and the scores, placements and
--   ids that statistics, the leaderboard and achievements read stay. A lobby
--   that held such games gets a neutral name the same way.
--
--   pseudonymisedAt records when that happened and is the rule's idempotency
--   marker: the daily run only touches rows where it is NULL, so a row is
--   rewritten once. Two nullable columns with no default: every existing row
--   gets NULL, which is the truth, since nothing has been pseudonymised yet.
--   Additive only; the Control Panel's read-only schema copy ignores them.
-- ============================================================================

ALTER TABLE "Games"
  ADD COLUMN IF NOT EXISTS "pseudonymisedAt" TIMESTAMPTZ(3);

ALTER TABLE "Lobbies"
  ADD COLUMN IF NOT EXISTS "pseudonymisedAt" TIMESTAMPTZ(3);
