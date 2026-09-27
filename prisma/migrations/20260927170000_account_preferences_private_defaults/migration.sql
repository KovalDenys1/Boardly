-- ============================================================================
-- Migration: AccountPreferences private defaults
-- Date: 2026-09-27
-- Description:
--   #1131 (audit L1-07, GDPR Art. 25(2)): a new account's profile was public
--   and its online status shown until the person changed them. Decision
--   (Denys, 2026-09-27): new accounts start friends-only with online status
--   off, and onboarding offers to open the profile.
--
--   Column defaults only, no UPDATE: every existing row keeps the values it
--   has, so no current account changes. New accounts get their row when the
--   account is created (app/api/auth/register, lib/custom-prisma-adapter.ts)
--   and so pick these defaults up. Additive; the Control Panel's read-only
--   schema copy is unaffected.
-- ============================================================================

ALTER TABLE "AccountPreferences" ALTER COLUMN "profileVisibility" SET DEFAULT 'friends';
ALTER TABLE "AccountPreferences" ALTER COLUMN "showOnlineStatus" SET DEFAULT false;
