-- ============================================================================
-- Migration: Add RLS Policies for Social Features
-- Date: 2026-02-12
-- Description:
--   Enable RLS and add policies for FriendRequests, Friendships, and SpyLocations
--   tables that were created outside of migration system.
-- ============================================================================

-- Enable RLS on social feature tables
ALTER TABLE "FriendRequests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Friendships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpyLocations" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FRIEND REQUESTS POLICIES
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
-- FRIENDSHIPS POLICIES
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
-- SPY LOCATIONS POLICIES
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
