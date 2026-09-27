-- ============================================================================
-- Migration: Users.inactivityWarningSentAt, Users.inactivityWarningDeliveredAt
-- Date: 2026-09-28
-- Description:
--   #1130, decision 2026-09-27: a registered account with no activity for 24
--   months is deleted, after a warning email 30 days before
--   (lib/inactive-accounts.ts; switched off until the Terms allow it,
--   TERMS_ALLOW_INACTIVITY_DELETION).
--
--   inactivityWarningSentAt is the send's claim: the job moves it with a
--   compare-and-set before sending and puts it back if the email is refused,
--   the way lastSubscriptionNoticeAt works. inactivityWarningDeliveredAt is
--   written only after Resend has accepted the email, and deletion requires it
--   (later than the last activity, at least 30 days old), so a run that dies
--   between the claim and the send can never lead to an unwarned deletion.
--
--   Two nullable columns with no default: every existing row gets NULL, which
--   is the truth, since no warning was ever sent. Additive only; the Control
--   Panel's read-only schema copy ignores them.
-- ============================================================================

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "inactivityWarningSentAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "inactivityWarningDeliveredAt" TIMESTAMPTZ(3);
