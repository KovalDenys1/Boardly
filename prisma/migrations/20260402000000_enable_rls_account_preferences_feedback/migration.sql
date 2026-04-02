-- ============================================================================
-- Migration: Enable RLS on AccountPreferences and Feedback
-- Date: 2026-04-02
-- Description:
--   Enable Row Level Security on AccountPreferences and Feedback tables.
--   These tables are only accessed via Prisma (postgres role) which bypasses
--   RLS, so no policies are needed. Enabling RLS blocks direct access via
--   the Supabase anon/authenticated REST API.
-- ============================================================================

ALTER TABLE "AccountPreferences" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
