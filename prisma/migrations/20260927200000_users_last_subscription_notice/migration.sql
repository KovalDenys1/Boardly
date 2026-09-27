-- ============================================================================
-- Migration: Users.lastSubscriptionNoticeAt
-- Date: 2026-09-27
-- Description:
--   #1165 (audit L3-05). digitalytelsesloven § 33 fourth paragraph: at least
--   once every six months the supplier of a running digital service sends the
--   consumer a notice that the contract runs and how to end it. Link's renewal
--   emails do not meet that (docs/OPERATIONS.md), so a daily cron sends our
--   own (lib/subscription-notice.ts). This column records the last one sent
--   and is the send's claim.
--
--   One nullable column with no default: every existing row gets NULL, which
--   is the truth, since no notice was ever sent. Additive only; the Control
--   Panel's read-only schema copy ignores it.
-- ============================================================================

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "lastSubscriptionNoticeAt" TIMESTAMPTZ(3);
