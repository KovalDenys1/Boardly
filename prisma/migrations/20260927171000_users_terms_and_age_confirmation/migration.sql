-- ============================================================================
-- Migration: Users.termsAcceptedAt and Users.ageConfirmedAt
-- Date: 2026-09-27
-- Description:
--   #1135 (audit L1-13). Decision (Denys, 2026-09-27): accounts rest on
--   contract (GDPR Art. 6(1)(b)), so the Art. 8 / personopplysningsloven § 5
--   consent age does not apply; registration asks for an "I am 13 or older"
--   confirmation, and the time the Terms were accepted and the age was
--   confirmed is stored. An OAuth account does both in onboarding.
--
--   Two nullable columns with no default: every existing row gets NULL,
--   which is the truth, since nothing was recorded before. Guests keep NULL.
--   Additive only; the Control Panel's read-only schema copy ignores them.
-- ============================================================================

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "ageConfirmedAt" TIMESTAMPTZ(3);
