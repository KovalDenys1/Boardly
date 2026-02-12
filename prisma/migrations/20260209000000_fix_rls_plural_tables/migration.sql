-- Fix RLS Migration for Plural Table Names
-- This migration updates all RLS policies to use plural table names (Users, Games, etc.)
-- and adds RLS support for the new Bots table

-- Migration created: 2026-02-09
-- Issue: #33 - [CRITICAL] Fix RLS Migration for Plural Table Names

-- ============================================================================
-- HELPER FUNCTIONS (No changes needed - already use correct logic)
-- ============================================================================

-- Function to get current user ID (supports both auth.uid() and custom JWT claims)
CREATE OR REPLACE FUNCTION get_current_user_id() 
RETURNS TEXT AS $$
BEGIN
  -- Try to get user ID from Supabase auth
  IF current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL THEN
    RETURN current_setting('request.jwt.claims', true)::json->>'sub';
  END IF;
  
  -- Fallback to custom claim (for guest users with X-Guest-Token)
  IF current_setting('request.jwt.claims', true)::json->>'user_id' IS NOT NULL THEN
    RETURN current_setting('request.jwt.claims', true)::json->>'user_id';
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current user is authenticated (not a guest)
CREATE OR REPLACE FUNCTION is_authenticated() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES (Updated to plural names + added Bots)
-- ============================================================================

ALTER TABLE "Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationTokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetTokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerificationTokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lobbies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Games" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Players" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES (Updated table name)
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON "Users"
  FOR SELECT
  USING (id = get_current_user_id());

-- Users can view public info of other users (for game/friend features)
CREATE POLICY "Users can view public info"
  ON "Users"
  FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON "Users"
  FOR UPDATE
  USING (id = get_current_user_id());

-- Service role can manage all users (for bot creation, cleanup, etc.)
CREATE POLICY "Service role can manage users"
  ON "Users"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- BOTS TABLE POLICIES (New table - added Feb 2026)
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
-- ACCOUNTS TABLE POLICIES (OAuth accounts - Updated table name)
-- ============================================================================

-- Users can only view their own accounts
CREATE POLICY "Users can view own accounts"
  ON "Accounts"
  FOR SELECT
  USING ("userId" = get_current_user_id());

-- Users can only manage their own accounts
CREATE POLICY "Users can manage own accounts"
  ON "Accounts"
  FOR ALL
  USING ("userId" = get_current_user_id());

-- ============================================================================
-- SESSIONS TABLE POLICIES (Updated table name)
-- ============================================================================

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions"
  ON "Sessions"
  FOR SELECT
  USING ("userId" = get_current_user_id());

-- Users can delete their own sessions (logout)
CREATE POLICY "Users can delete own sessions"
  ON "Sessions"
  FOR DELETE
  USING ("userId" = get_current_user_id());

-- Service role can manage all sessions (for cleanup)
CREATE POLICY "Service role can manage sessions"
  ON "Sessions"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- VERIFICATION TOKENS POLICIES (Updated table name)
-- ============================================================================

-- Anyone can read verification tokens (needed for email verification flow)
CREATE POLICY "Anyone can read verification tokens"
  ON "VerificationTokens"
  FOR SELECT
  USING (true);

-- Service role can manage verification tokens
CREATE POLICY "Service role can manage verification tokens"
  ON "VerificationTokens"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- PASSWORD RESET TOKENS POLICIES (Updated table name)
-- ============================================================================

-- Only service role can manage password reset tokens
CREATE POLICY "Service role can manage password reset tokens"
  ON "PasswordResetTokens"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- EMAIL VERIFICATION TOKENS POLICIES (Updated table name)
-- ============================================================================

-- Only service role can manage email verification tokens
CREATE POLICY "Service role can manage email verification tokens"
  ON "EmailVerificationTokens"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- LOBBIES TABLE POLICIES (Updated table name)
-- ============================================================================

-- Anyone can view active lobbies (for lobby list)
CREATE POLICY "Anyone can view lobbies"
  ON "Lobbies"
  FOR SELECT
  USING ("isActive" = true);

-- Users can view all lobbies (including inactive ones they created)
CREATE POLICY "Creators can view own lobbies"
  ON "Lobbies"
  FOR SELECT
  USING ("creatorId" = get_current_user_id());

-- Users can create lobbies
CREATE POLICY "Users can create lobbies"
  ON "Lobbies"
  FOR INSERT
  WITH CHECK ("creatorId" = get_current_user_id());

-- Creators can update their own lobbies
CREATE POLICY "Creators can update own lobbies"
  ON "Lobbies"
  FOR UPDATE
  USING ("creatorId" = get_current_user_id());

-- Creators can delete their own lobbies
CREATE POLICY "Creators can delete own lobbies"
  ON "Lobbies"
  FOR DELETE
  USING ("creatorId" = get_current_user_id());

-- Service role can manage all lobbies
CREATE POLICY "Service role can manage lobbies"
  ON "Lobbies"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- GAMES TABLE POLICIES (Updated table name and Player references)
-- ============================================================================

-- Users can view games they are playing in
CREATE POLICY "Players can view their games"
  ON "Games"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Players"
      WHERE "Players"."gameId" = "Games"."id"
      AND "Players"."userId" = get_current_user_id()
    )
  );

-- Lobby creators can view games in their lobbies
CREATE POLICY "Lobby creators can view lobby games"
  ON "Games"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Lobbies"
      WHERE "Lobbies"."id" = "Games"."lobbyId"
      AND "Lobbies"."creatorId" = get_current_user_id()
    )
  );

-- Service role can manage all games (for game logic, bot moves, cleanup)
CREATE POLICY "Service role can manage games"
  ON "Games"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- PLAYERS TABLE POLICIES (Updated table name)
-- ============================================================================

-- Users can view player records in games they are in
CREATE POLICY "Users can view players in their games"
  ON "Players"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Players" AS "MyPlayer"
      WHERE "MyPlayer"."gameId" = "Players"."gameId"
      AND "MyPlayer"."userId" = get_current_user_id()
    )
  );

-- Users can view their own player records
CREATE POLICY "Users can view own player records"
  ON "Players"
  FOR SELECT
  USING ("userId" = get_current_user_id());

-- Service role can manage all players (for game logic, bot players)
CREATE POLICY "Service role can manage players"
  ON "Players"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- GRANT PERMISSIONS TO AUTHENTICATED USERS
-- ============================================================================

-- Grant necessary permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant permissions to service role (full access for backend operations)
GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================================
-- INDEXES FOR RLS PERFORMANCE (Updated table names)
-- ============================================================================

-- These indexes improve RLS policy performance
CREATE INDEX IF NOT EXISTS "idx_players_userid_gameid" ON "Players"("userId", "gameId");
CREATE INDEX IF NOT EXISTS "idx_games_lobbyid" ON "Games"("lobbyId");
CREATE INDEX IF NOT EXISTS "idx_lobbies_creatorid" ON "Lobbies"("creatorId");
CREATE INDEX IF NOT EXISTS "idx_bots_userid" ON "Bots"("userId");

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_current_user_id() IS 'Returns the current user ID from JWT claims (supports both auth.uid() and custom claims for guests)';
COMMENT ON FUNCTION is_authenticated() IS 'Returns true if the current user is authenticated (not a guest)';

-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================

-- This migration fixes the following issues from 20260205000000_enable_rls:
-- 1. Updated all table references from singular to plural names (User → Users, etc.)
-- 2. Added RLS policies for new "Bots" table (separated from Users in Feb 2026)
-- 3. Updated all cross-table references (Players, Games, Lobbies)
-- 4. Added performance index for Bots table
-- 
-- Total tables with RLS enabled: 10
-- - Users, Bots (user-related)
-- - Accounts, Sessions (authentication)
-- - VerificationTokens, PasswordResetTokens, EmailVerificationTokens (tokens)
-- - Lobbies, Games, Players (game-related)
--
-- Security Model: Multi-layer defense
-- 1. NextAuth (session/JWT) - Layer 1
-- 2. API routes (business logic) - Layer 2
-- 3. RLS (database safety net) - Layer 3 ← THIS MIGRATION
--
-- Prisma Connection: Uses service_role via connection pooler (port 6543)
-- - Full access bypasses RLS
-- - Ensures no breaking changes to existing queries
