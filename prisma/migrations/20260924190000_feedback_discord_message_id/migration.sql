-- ============================================================================
-- Migration: Feedback.discordMessageId
-- Date: 2026-09-24
-- Description:
--   Every feedback message is also posted to the team's Discord feedback channel
--   with the sender's username and id or email (app/api/feedback/route.ts). The
--   privacy notice says feedback is kept 12 months and that account deletion strips
--   the sender from it, which was only true of the database row. This column stores
--   the Discord message id so the retention rule and account deletion can delete
--   the Discord copy as well (lib/feedback-discord.ts).
--
--   Additive and nullable: existing rows get NULL and nothing reads it as a gate.
-- ============================================================================

ALTER TABLE "Feedback" ADD COLUMN "discordMessageId" TEXT;
