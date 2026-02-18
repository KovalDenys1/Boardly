-- ============================================================================
-- Migration: RLS baseline policy repair
-- Date: 2026-02-18
-- Description:
--   Restore baseline user-facing RLS policies expected by smoke checks and app
--   behavior, with explicit roles and initplan-friendly helpers.
-- ============================================================================

-- USERS
DROP POLICY IF EXISTS "Users can view own profile" ON public."Users";
CREATE POLICY "Users can view own profile"
  ON public."Users" FOR SELECT
  TO authenticated
  USING (id = (SELECT public.get_current_user_id()));

DROP POLICY IF EXISTS "Users can view public info" ON public."Users";
CREATE POLICY "Users can view public info"
  ON public."Users" FOR SELECT
  TO anon, authenticated
  USING (true);

-- BOTS
DROP POLICY IF EXISTS "Anyone can view bots" ON public."Bots";
CREATE POLICY "Anyone can view bots"
  ON public."Bots" FOR SELECT
  TO anon, authenticated
  USING (true);

-- LOBBIES
DROP POLICY IF EXISTS "Anyone can view lobbies" ON public."Lobbies";
CREATE POLICY "Anyone can view lobbies"
  ON public."Lobbies" FOR SELECT
  TO anon, authenticated
  USING (true);

-- GAMES
DROP POLICY IF EXISTS "Players can view their games" ON public."Games";
CREATE POLICY "Players can view their games"
  ON public."Games" FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public."Players" p
      WHERE p."gameId" = "Games".id
        AND p."userId" = (SELECT public.get_current_user_id())
    )
  );

-- PLAYERS
DROP POLICY IF EXISTS "Users can view players in their games" ON public."Players";
CREATE POLICY "Users can view players in their games"
  ON public."Players" FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public."Players" p2
      WHERE p2."gameId" = "Players"."gameId"
        AND p2."userId" = (SELECT public.get_current_user_id())
    )
  );

