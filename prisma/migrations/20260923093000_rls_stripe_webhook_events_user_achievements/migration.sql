-- ============================================================================
-- Migration: RLS on StripeWebhookEvents and UserAchievements, invoker helpers
-- Date: 2026-09-23
-- Description:
--   Both tables were added in August (20260806190000, 20260807120000) without
--   RLS. Production had RLS switched on by hand with no policy and no migration;
--   boardly-dev still had it off, which Supabase flags as critical. Both tables
--   are read and written only by the server through Prisma, so they take the
--   same shape as every other server-only table: RLS on, service_role only.
--
--   The three helpers only read request.jwt.claims, so SECURITY DEFINER gives
--   them nothing. Switching them to SECURITY INVOKER clears advisor lints
--   0028/0029 without revoking EXECUTE, which would break the policies for
--   authenticated and public that call get_current_user_id().
-- ============================================================================

DO $$
DECLARE
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  service_clause TEXT;
BEGIN
  service_clause := CASE WHEN has_service_role THEN 'TO service_role' ELSE '' END;

  EXECUTE 'ALTER TABLE public."StripeWebhookEvents" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage stripe webhook events" ON public."StripeWebhookEvents"';
  EXECUTE format(
    'CREATE POLICY "Service role can manage stripe webhook events"
       ON public."StripeWebhookEvents" FOR ALL
       %s
       USING ((SELECT public.is_service_role()))
       WITH CHECK ((SELECT public.is_service_role()))',
    service_clause
  );

  EXECUTE 'ALTER TABLE public."UserAchievements" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage user achievements" ON public."UserAchievements"';
  EXECUTE format(
    'CREATE POLICY "Service role can manage user achievements"
       ON public."UserAchievements" FOR ALL
       %s
       USING ((SELECT public.is_service_role()))
       WITH CHECK ((SELECT public.is_service_role()))',
    service_clause
  );
END
$$;

ALTER FUNCTION public.get_current_user_id() SECURITY INVOKER;
ALTER FUNCTION public.is_authenticated() SECURITY INVOKER;
ALTER FUNCTION public.is_service_role() SECURITY INVOKER;
