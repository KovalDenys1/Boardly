-- ============================================================================
-- Migration: RLS baseline policy repair
-- Date: 2026-02-18
-- Description:
--   Restore baseline user-facing RLS policies expected by smoke checks and app
--   behavior, with explicit roles and initplan-friendly helpers.
-- ============================================================================

-- USERS
DROP POLICY IF EXISTS "Users can view own profile" ON public."Users";

DROP POLICY IF EXISTS "Users can view public info" ON public."Users";

-- BOTS
DROP POLICY IF EXISTS "Anyone can view bots" ON public."Bots";

-- LOBBIES
DROP POLICY IF EXISTS "Anyone can view lobbies" ON public."Lobbies";

-- GAMES
DROP POLICY IF EXISTS "Players can view their games" ON public."Games";

-- PLAYERS
DROP POLICY IF EXISTS "Users can view players in their games" ON public."Players";

-- Some environments (e.g. plain PostgreSQL in CI) do not have Supabase roles
-- like anon/authenticated. Build policies with role clauses only when roles exist.
DO $$
DECLARE
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  public_read_role_clause TEXT;
  authenticated_role_clause TEXT;
BEGIN
  public_read_role_clause := CASE
    WHEN has_anon AND has_authenticated THEN 'TO anon, authenticated'
    WHEN has_anon THEN 'TO anon'
    WHEN has_authenticated THEN 'TO authenticated'
    ELSE ''
  END;

  authenticated_role_clause := CASE
    WHEN has_authenticated THEN 'TO authenticated'
    ELSE ''
  END;

  EXECUTE format(
    'CREATE POLICY "Users can view own profile"
      ON public."Users" FOR SELECT
      %s
      USING (id = (SELECT public.get_current_user_id()))',
    authenticated_role_clause
  );

  EXECUTE format(
    'CREATE POLICY "Users can view public info"
      ON public."Users" FOR SELECT
      %s
      USING (true)',
    public_read_role_clause
  );

  EXECUTE format(
    'CREATE POLICY "Anyone can view bots"
      ON public."Bots" FOR SELECT
      %s
      USING (true)',
    public_read_role_clause
  );

  EXECUTE format(
    'CREATE POLICY "Anyone can view lobbies"
      ON public."Lobbies" FOR SELECT
      %s
      USING (true)',
    public_read_role_clause
  );

  EXECUTE format(
    'CREATE POLICY "Players can view their games"
      ON public."Games" FOR SELECT
      %s
      USING (
        EXISTS (
          SELECT 1
          FROM public."Players" p
          WHERE p."gameId" = "Games".id
            AND p."userId" = (SELECT public.get_current_user_id())
        )
      )',
    authenticated_role_clause
  );

  EXECUTE format(
    'CREATE POLICY "Users can view players in their games"
      ON public."Players" FOR SELECT
      %s
      USING (
        EXISTS (
          SELECT 1
          FROM public."Players" p2
          WHERE p2."gameId" = "Players"."gameId"
            AND p2."userId" = (SELECT public.get_current_user_id())
        )
      )',
    authenticated_role_clause
  );
END
$$;
