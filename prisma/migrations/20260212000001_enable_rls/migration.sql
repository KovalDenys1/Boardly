-- ============================================================================
-- Migration: Enable Row Level Security
-- Date: 2026-02-12
-- Description:
--   1. Create helper functions for RLS policies
--   2. Enable RLS on all tables
--   3. Create policies for all tables
--   4. Grant permissions to Supabase roles
--   5. Create performance indexes for RLS
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_user_id() 
RETURNS TEXT AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL THEN
    RETURN current_setting('request.jwt.claims', true)::json->>'sub';
  END IF;
  IF current_setting('request.jwt.claims', true)::json->>'user_id' IS NOT NULL THEN
    RETURN current_setting('request.jwt.claims', true)::json->>'user_id';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_authenticated() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_current_user_id () IS 'Returns the current user ID from JWT claims';

COMMENT ON FUNCTION is_authenticated () IS 'Returns true if the current user is authenticated';

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
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

ALTER TABLE "FriendRequests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Friendships" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "SpyLocations" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own profile" ON "Users" FOR
SELECT USING (id = get_current_user_id ());

CREATE POLICY "Users can view public info" ON "Users" FOR
SELECT USING (true);

CREATE POLICY "Users can update own profile" ON "Users" FOR
UPDATE USING (id = get_current_user_id ());

CREATE POLICY "Service role can manage users"
  ON "Users" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- BOTS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view bots" ON "Bots" FOR
SELECT USING (true);

CREATE POLICY "Service role can manage bots"
  ON "Bots" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- ACCOUNTS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own accounts" ON "Accounts" FOR
SELECT USING (
        "userId" = get_current_user_id ()
    );

CREATE POLICY "Users can manage own accounts" ON "Accounts" FOR ALL USING (
    "userId" = get_current_user_id ()
);

CREATE POLICY "Service role can manage accounts"
  ON "Accounts" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- SESSIONS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own sessions" ON "Sessions" FOR
SELECT USING (
        "userId" = get_current_user_id ()
    );

CREATE POLICY "Service role can manage sessions"
  ON "Sessions" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- TOKEN TABLE POLICIES (VerificationTokens, PasswordResetTokens, EmailVerificationTokens)
-- ============================================================================

CREATE POLICY "Service role can manage verification tokens"
  ON "VerificationTokens" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "Service role can manage password reset tokens"
  ON "PasswordResetTokens" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "Service role can manage email verification tokens"
  ON "EmailVerificationTokens" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- LOBBIES POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view lobbies" ON "Lobbies" FOR
SELECT USING (true);

CREATE POLICY "Authenticated users can create lobbies" ON "Lobbies" FOR
INSERT
WITH
    CHECK (true);

CREATE POLICY "Creators can update own lobbies" ON "Lobbies" FOR
UPDATE USING (
    "creatorId" = get_current_user_id ()
);

CREATE POLICY "Service role can manage lobbies"
  ON "Lobbies" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- GAMES POLICIES
-- ============================================================================

CREATE POLICY "Players can view their games"
  ON "Games" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Players" p
      WHERE p."gameId" = "Games".id
        AND p."userId" = get_current_user_id()
    )
  );

CREATE POLICY "Service role can manage games"
  ON "Games" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- PLAYERS POLICIES
-- ============================================================================

CREATE POLICY "Users can view players in their games"
  ON "Players" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Players" p2
      WHERE p2."gameId" = "Players"."gameId"
        AND p2."userId" = get_current_user_id()
    )
  );

CREATE POLICY "Users can update own player data" ON "Players" FOR
UPDATE USING (
    "userId" = get_current_user_id ()
);

CREATE POLICY "Service role can manage players"
  ON "Players" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- FRIEND REQUESTS POLICIES
-- ============================================================================

CREATE POLICY "Users can view sent friend requests" ON "FriendRequests" FOR
SELECT USING (
        "senderId" = get_current_user_id ()
    );

CREATE POLICY "Users can view received friend requests" ON "FriendRequests" FOR
SELECT USING (
        "receiverId" = get_current_user_id ()
    );

CREATE POLICY "Users can send friend requests" ON "FriendRequests" FOR
INSERT
WITH
    CHECK (
        "senderId" = get_current_user_id ()
    );

CREATE POLICY "Senders can update own friend requests" ON "FriendRequests" FOR
UPDATE USING (
    "senderId" = get_current_user_id ()
);

CREATE POLICY "Receivers can update received friend requests" ON "FriendRequests" FOR
UPDATE USING (
    "receiverId" = get_current_user_id ()
);

CREATE POLICY "Senders can delete own friend requests" ON "FriendRequests" FOR DELETE USING (
    "senderId" = get_current_user_id ()
);

CREATE POLICY "Service role can manage friend requests"
  ON "FriendRequests" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- FRIENDSHIPS POLICIES
-- ============================================================================

CREATE POLICY "Users can view own friendships" ON "Friendships" FOR
SELECT USING (
        "user1Id" = get_current_user_id ()
        OR "user2Id" = get_current_user_id ()
    );

CREATE POLICY "Service role can create friendships"
  ON "Friendships" FOR INSERT
  WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "Users can delete own friendships" ON "Friendships" FOR DELETE USING (
    "user1Id" = get_current_user_id ()
    OR "user2Id" = get_current_user_id ()
);

CREATE POLICY "Service role can manage friendships"
  ON "Friendships" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- SPY LOCATIONS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view active spy locations" ON "SpyLocations" FOR
SELECT USING ("isActive" = true);

CREATE POLICY "Service role can manage spy locations"
  ON "SpyLocations" FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- GRANT PERMISSIONS TO SUPABASE ROLES
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT
SELECT,
INSERT
,
UPDATE,
DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT USAGE,
SELECT
    ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT ALL ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================================
-- PERFORMANCE INDEXES FOR RLS
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_players_userid_gameid" ON "Players" ("userId", "gameId");

CREATE INDEX IF NOT EXISTS "idx_games_lobbyid" ON "Games" ("lobbyId");

CREATE INDEX IF NOT EXISTS "idx_lobbies_creatorid" ON "Lobbies" ("creatorId");

CREATE INDEX IF NOT EXISTS "idx_bots_userid" ON "Bots" ("userId");