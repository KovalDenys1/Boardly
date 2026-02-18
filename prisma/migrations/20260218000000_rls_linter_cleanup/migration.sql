-- ============================================================================
-- Migration: RLS linter cleanup and hardening
-- Date: 2026-02-18
-- Description:
--   1) Remove legacy overly permissive "Service role full access" policies
--   2) Scope service policies to service_role and avoid role-wide duplicates
--   3) Set stable/search_path-safe helper functions
--   4) Enable RLS on _prisma_migrations and add scoped policy
--   5) Consolidate FriendRequests policies to reduce multiple permissive warnings
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS (stable + fixed search_path)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL THEN
    RETURN current_setting('request.jwt.claims', true)::json->>'sub';
  END IF;
  IF current_setting('request.jwt.claims', true)::json->>'user_id' IS NOT NULL THEN
    RETURN current_setting('request.jwt.claims', true)::json->>'user_id';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role';
$$;

COMMENT ON FUNCTION public.is_service_role() IS 'Returns true when request JWT role claim equals service_role';

-- ============================================================================
-- ENABLE RLS FOR PRISMA MIGRATIONS TABLE (Supabase linter requirement)
-- ============================================================================

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage prisma migrations" ON public._prisma_migrations;
CREATE POLICY "Service role can manage prisma migrations"
  ON public._prisma_migrations
  FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

-- ============================================================================
-- REMOVE LEGACY OVERLY PERMISSIVE POLICIES (created by old bootstrap scripts)
-- ============================================================================

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Users',
    'Bots',
    'Accounts',
    'Sessions',
    'VerificationTokens',
    'PasswordResetTokens',
    'EmailVerificationTokens',
    'Lobbies',
    'Games',
    'Players',
    'FriendRequests',
    'Friendships',
    'SpyLocations',
    'LobbyInvites'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I', table_name);
  END LOOP;
END
$$;

-- ============================================================================
-- SERVICE ROLE POLICIES (scoped, non-public)
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage users" ON public."Users";
CREATE POLICY "Service role can manage users"
  ON public."Users" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage bots" ON public."Bots";
CREATE POLICY "Service role can manage bots"
  ON public."Bots" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage accounts" ON public."Accounts";
CREATE POLICY "Service role can manage accounts"
  ON public."Accounts" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage sessions" ON public."Sessions";
CREATE POLICY "Service role can manage sessions"
  ON public."Sessions" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage verification tokens" ON public."VerificationTokens";
CREATE POLICY "Service role can manage verification tokens"
  ON public."VerificationTokens" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage password reset tokens" ON public."PasswordResetTokens";
CREATE POLICY "Service role can manage password reset tokens"
  ON public."PasswordResetTokens" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage email verification tokens" ON public."EmailVerificationTokens";
CREATE POLICY "Service role can manage email verification tokens"
  ON public."EmailVerificationTokens" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage lobbies" ON public."Lobbies";
CREATE POLICY "Service role can manage lobbies"
  ON public."Lobbies" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage games" ON public."Games";
CREATE POLICY "Service role can manage games"
  ON public."Games" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage players" ON public."Players";
CREATE POLICY "Service role can manage players"
  ON public."Players" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage friend requests" ON public."FriendRequests";
CREATE POLICY "Service role can manage friend requests"
  ON public."FriendRequests" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can create friendships" ON public."Friendships";
DROP POLICY IF EXISTS "Service role can manage friendships" ON public."Friendships";
CREATE POLICY "Service role can manage friendships"
  ON public."Friendships" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage spy locations" ON public."SpyLocations";
CREATE POLICY "Service role can manage spy locations"
  ON public."SpyLocations" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

DROP POLICY IF EXISTS "Service role can manage lobby invites" ON public."LobbyInvites";
CREATE POLICY "Service role can manage lobby invites"
  ON public."LobbyInvites" FOR ALL
  TO service_role
  USING ((SELECT public.is_service_role()))
  WITH CHECK ((SELECT public.is_service_role()));

-- ============================================================================
-- FRIEND REQUEST POLICIES (consolidated to avoid multi-policy warnings)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view sent friend requests" ON public."FriendRequests";
DROP POLICY IF EXISTS "Users can view received friend requests" ON public."FriendRequests";
DROP POLICY IF EXISTS "Senders can update own friend requests" ON public."FriendRequests";
DROP POLICY IF EXISTS "Receivers can update received friend requests" ON public."FriendRequests";
DROP POLICY IF EXISTS "Users can view own friend requests" ON public."FriendRequests";
DROP POLICY IF EXISTS "Users can update own friend requests" ON public."FriendRequests";

CREATE POLICY "Users can view own friend requests"
  ON public."FriendRequests" FOR SELECT
  TO authenticated
  USING (
    "senderId" = (SELECT public.get_current_user_id())
    OR "receiverId" = (SELECT public.get_current_user_id())
  );

CREATE POLICY "Users can update own friend requests"
  ON public."FriendRequests" FOR UPDATE
  TO authenticated
  USING (
    "senderId" = (SELECT public.get_current_user_id())
    OR "receiverId" = (SELECT public.get_current_user_id())
  )
  WITH CHECK (
    "senderId" = (SELECT public.get_current_user_id())
    OR "receiverId" = (SELECT public.get_current_user_id())
  );

DROP POLICY IF EXISTS "Users can send friend requests" ON public."FriendRequests";
CREATE POLICY "Users can send friend requests"
  ON public."FriendRequests" FOR INSERT
  TO authenticated
  WITH CHECK ("senderId" = (SELECT public.get_current_user_id()));

DROP POLICY IF EXISTS "Senders can delete own friend requests" ON public."FriendRequests";
CREATE POLICY "Senders can delete own friend requests"
  ON public."FriendRequests" FOR DELETE
  TO authenticated
  USING ("senderId" = (SELECT public.get_current_user_id()));

