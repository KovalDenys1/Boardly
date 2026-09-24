-- ============================================================================
-- Migration: Users.sessionsValidFrom
-- Date: 2026-09-24
-- Description:
--   Session cutoff for #1136 (audit S1-01, the fix #805 specified and PR #835
--   never shipped). Sessions are stateless NextAuth JWTs, so a password reset
--   could not end a session stolen before it. lib/next-auth.ts now rejects any
--   token whose authenticatedAt is earlier than this column; the reset route
--   and a completed email change set it to now().
--
--   Nullable with no default, and NULL means "no cutoff": every existing row
--   gets NULL, so no session that is valid today stops working when this
--   runs. Additive only; the Control Panel's read-only schema copy ignores it.
-- ============================================================================

ALTER TABLE "Users" ADD COLUMN "sessionsValidFrom" TIMESTAMPTZ(3);
