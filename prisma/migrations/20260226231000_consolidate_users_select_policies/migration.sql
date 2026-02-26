-- ============================================================================
-- Migration: Consolidate Users SELECT RLS policies to avoid duplicate permissive
-- Date: 2026-02-26
-- Description:
--   Replace overlapping Users SELECT policies with one policy per role/action:
--   - authenticated: public user info (single permissive SELECT policy)
--   - anon: public user info
--   This preserves existing behavior (users remain publicly readable) while
--   removing Supabase linter warning for multiple permissive SELECT policies.
-- ============================================================================

DO $$
DECLARE
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  anon_role_clause TEXT;
  authenticated_role_clause TEXT;
BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON public."Users";
  DROP POLICY IF EXISTS "Users can view public info" ON public."Users";
  DROP POLICY IF EXISTS "Authenticated users can view public user info" ON public."Users";
  DROP POLICY IF EXISTS "Anon users can view public user info" ON public."Users";

  anon_role_clause := CASE
    WHEN has_anon THEN 'TO anon'
    ELSE ''
  END;

  authenticated_role_clause := CASE
    WHEN has_authenticated THEN 'TO authenticated'
    ELSE ''
  END;

  EXECUTE format(
    'CREATE POLICY "Authenticated users can view public user info"
       ON public."Users" FOR SELECT
       %s
       USING (true)',
    authenticated_role_clause
  );

  EXECUTE format(
    'CREATE POLICY "Anon users can view public user info"
       ON public."Users" FOR SELECT
       %s
       USING (true)',
    anon_role_clause
  );
END
$$;
