-- ============================================================================
-- Migration: marketing consent
-- Date: 2026-09-24
-- Description:
--   #1154 (L2-05). markedsføringsloven § 15 requires prior consent before any
--   marketing email, or (in the narrower existing-customer exception) an easy,
--   free way to opt out at collection and in every message. Nothing sends a
--   marketing email today (lib/email.ts sends only service messages), so this
--   migration only lays the column down: additive, default false, changes
--   behaviour for nobody and logs nobody out.
--
--   marketingConsentAt is stamped whenever marketingConsent changes (see
--   lib/notification-preferences.ts upsertNotificationPreferences), not left to
--   the table's own updatedAt, since any other preference edit touches that too
--   and would otherwise look like a fresh consent timestamp it is not.
-- ============================================================================

ALTER TABLE "NotificationPreferences"
  ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMPTZ(3);
