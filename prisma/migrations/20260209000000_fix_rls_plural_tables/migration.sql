-- Add RLS Support for Bots Table
-- This migration adds RLS policies for the new Bots table created in 20260205103850_rename_tables_and_extract_bots
-- Note: Other table policies already exist from 20260205000000_enable_rls and were automatically
-- updated when tables were renamed in 20260205103850_rename_tables_and_extract_bots

-- Migration created: 2026-02-09
-- Issue: #33 - Add RLS for Bots table

-- ============================================================================
-- ENABLE RLS ON BOTS TABLE
-- ============================================================================

ALTER TABLE "Bots" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- BOTS TABLE POLICIES
-- ============================================================================

-- Anyone can view bot information (needed for game player lists)
CREATE POLICY "Anyone can view bots"
  ON "Bots"
  FOR SELECT
  USING (true);

-- Service role can manage all bots (bot creation, updates, cleanup)
CREATE POLICY "Service role can manage bots"
  ON "Bots"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- INDEXES FOR RLS PERFORMANCE
-- ============================================================================

-- Index for bot lookups by user ID
CREATE INDEX IF NOT EXISTS "idx_bots_userid" ON "Bots"("userId");

-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================

-- This migration adds RLS support for the Bots table that was created in 20260205103850
-- All other tables already have RLS enabled and policies from 20260205000000_enable_rls
-- When tables were renamed (User → Users, etc.), all policies automatically moved with them
