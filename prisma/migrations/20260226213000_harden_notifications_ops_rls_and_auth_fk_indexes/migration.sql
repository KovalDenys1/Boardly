-- ============================================================================
-- Migration: Harden RLS on internal public tables + add auth FK indexes
-- Date: 2026-02-26
-- Description:
--   1) Enable RLS on notification/operational tables in public schema
--   2) Add service-role-only policies for these internal tables
--   3) Add missing FK indexes on Accounts.userId and Sessions.userId
-- ============================================================================

-- Performance advisor: missing FK indexes on auth tables
CREATE INDEX IF NOT EXISTS "Accounts_userId_idx" ON public."Accounts"("userId");
CREATE INDEX IF NOT EXISTS "Sessions_userId_idx" ON public."Sessions"("userId");

-- Security advisor: RLS disabled in public schema internal tables
ALTER TABLE public."OperationalEvents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OperationalAlertStates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NotificationPreferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notifications" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  -- Drop legacy/partial policies if they exist.
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage operational events" ON public."OperationalEvents"';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage operational alert states" ON public."OperationalAlertStates"';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage notification preferences" ON public."NotificationPreferences"';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage notifications" ON public."Notifications"';

  -- In local/CI environments without Supabase roles, keep RLS enabled and rely on owner access.
  IF NOT has_service_role THEN
    RETURN;
  END IF;

  EXECUTE '
    CREATE POLICY "Service role can manage operational events"
      ON public."OperationalEvents" FOR ALL
      TO service_role
      USING ((SELECT public.is_service_role()))
      WITH CHECK ((SELECT public.is_service_role()))
  ';

  EXECUTE '
    CREATE POLICY "Service role can manage operational alert states"
      ON public."OperationalAlertStates" FOR ALL
      TO service_role
      USING ((SELECT public.is_service_role()))
      WITH CHECK ((SELECT public.is_service_role()))
  ';

  EXECUTE '
    CREATE POLICY "Service role can manage notification preferences"
      ON public."NotificationPreferences" FOR ALL
      TO service_role
      USING ((SELECT public.is_service_role()))
      WITH CHECK ((SELECT public.is_service_role()))
  ';

  EXECUTE '
    CREATE POLICY "Service role can manage notifications"
      ON public."Notifications" FOR ALL
      TO service_role
      USING ((SELECT public.is_service_role()))
      WITH CHECK ((SELECT public.is_service_role()))
  ';
END
$$;
