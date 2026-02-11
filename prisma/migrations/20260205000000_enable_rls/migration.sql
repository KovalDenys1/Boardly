-- Enable Row Level Security on all tables
-- This migration adds RLS policies to secure database access

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current user ID (supports both auth.uid() and custom JWT claims)
CREATE OR REPLACE FUNCTION get_current_user_id() 
RETURNS TEXT AS $$
BEGIN
  -- Try to get user ID from Supabase auth
  IF current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL THEN
    RETURN current_setting('request.jwt.claims', true)::json->>'sub';
  END IF;
  
  -- Fallback to custom claim (for guest users with X-Guest-Id header)
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
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE "Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationTokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetTokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerificationTokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lobbies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Games" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Players" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FriendRequests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Friendships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpyLocations" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USER TABLE POLICIES
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
-- ACCOUNT TABLE POLICIES (OAuth accounts)
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
-- SESSION TABLE POLICIES
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
-- VERIFICATION TOKEN POLICIES (Public for verification process)
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
-- PASSWORD RESET TOKEN POLICIES
-- ============================================================================

-- Only service role can manage password reset tokens
CREATE POLICY "Service role can manage password reset tokens"
  ON "PasswordResetTokens"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- EMAIL VERIFICATION TOKEN POLICIES
-- ============================================================================

-- Only service role can manage email verification tokens
CREATE POLICY "Service role can manage email verification tokens"
  ON "EmailVerificationTokens"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- LOBBY TABLE POLICIES
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
-- GAME TABLE POLICIES
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
-- PLAYER TABLE POLICIES
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

-- ============================================================================
-- FRIEND REQUEST POLICIES
-- ============================================================================

-- Users can view friend requests they sent
CREATE POLICY "Users can view sent friend requests"
  ON "FriendRequests"
  FOR SELECT
  USING ("senderId" = get_current_user_id());

-- Users can view friend requests they received
CREATE POLICY "Users can view received friend requests"
  ON "FriendRequests"
  FOR SELECT
  USING ("receiverId" = get_current_user_id());

-- Users can send friend requests
CREATE POLICY "Users can send friend requests"
  ON "FriendRequests"
  FOR INSERT
  WITH CHECK ("senderId" = get_current_user_id());

-- Users can update friend requests they sent (cancel)
CREATE POLICY "Senders can update own friend requests"
  ON "FriendRequests"
  FOR UPDATE
  USING ("senderId" = get_current_user_id());

-- Users can update friend requests they received (accept/reject)
CREATE POLICY "Receivers can update received friend requests"
  ON "FriendRequests"
  FOR UPDATE
  USING ("receiverId" = get_current_user_id());

-- Users can delete friend requests they sent
CREATE POLICY "Senders can delete own friend requests"
  ON "FriendRequests"
  FOR DELETE
  USING ("senderId" = get_current_user_id());

-- Service role can manage all friend requests
CREATE POLICY "Service role can manage friend requests"
  ON "FriendRequests"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- FRIENDSHIP POLICIES
-- ============================================================================

-- Users can view friendships they are part of
CREATE POLICY "Users can view own friendships"
  ON "Friendships"
  FOR SELECT
  USING (
    "user1Id" = get_current_user_id() OR 
    "user2Id" = get_current_user_id()
  );

-- Users can create friendships (handled by service after friend request acceptance)
CREATE POLICY "Service role can create friendships"
  ON "Friendships"
  FOR INSERT
  WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Users can delete friendships they are part of (unfriend)
CREATE POLICY "Users can delete own friendships"
  ON "Friendships"
  FOR DELETE
  USING (
    "user1Id" = get_current_user_id() OR 
    "user2Id" = get_current_user_id()
  );

-- Service role can manage all friendships
CREATE POLICY "Service role can manage friendships"
  ON "Friendships"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- SPY LOCATION POLICIES (Game content - read-only for users)
-- ============================================================================

-- Anyone can view active spy locations (needed for game)
CREATE POLICY "Anyone can view active spy locations"
  ON "SpyLocations"
  FOR SELECT
  USING ("isActive" = true);

-- Service role can manage spy locations
CREATE POLICY "Service role can manage spy locations"
  ON "SpyLocations"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
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
-- INDEXES FOR RLS PERFORMANCE
-- ============================================================================

-- These indexes improve RLS policy performance
CREATE INDEX IF NOT EXISTS "idx_player_userid_gameid" ON "Players"("userId", "gameId");
CREATE INDEX IF NOT EXISTS "idx_game_lobbyid" ON "Games"("lobbyId");
CREATE INDEX IF NOT EXISTS "idx_lobby_creatorid" ON "Lobbies"("creatorId");

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_current_user_id() IS 'Returns the current user ID from JWT claims (supports both auth.uid() and custom claims for guests)';
COMMENT ON FUNCTION is_authenticated() IS 'Returns true if the current user is authenticated (not a guest)';
