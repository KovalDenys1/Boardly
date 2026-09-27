-- ============================================================================
-- Migration: Users.inactivityWarningSentAt
-- Date: 2026-09-28
-- Description:
--   #1130, decision 2026-09-27: a registered account with no activity for 24
--   months is deleted, after a warning email 30 days before
--   (lib/inactive-accounts.ts). inactivityWarningSentAt records when that
--   warning went out and is the send's claim: the job moves it with a
--   compare-and-set and puts it back if the email fails, the way
--   lastSubscriptionNoticeAt works. The deletion requires a warning sent after
--   the account's last activity and at least 30 days old, so nobody is deleted
--   unwarned and a sign-in after the warning starts the clock again.
--
--   One nullable column with no default: every existing row gets NULL, which
--   is the truth, since no warning was ever sent. Additive only; the Control
--   Panel's read-only schema copy ignores it.
-- ============================================================================

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "inactivityWarningSentAt" TIMESTAMPTZ(3);
