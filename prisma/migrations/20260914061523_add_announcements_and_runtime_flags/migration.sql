-- ============================================================================
-- Migration: Announcements and RuntimeFlags
-- Date: 2026-09-14
-- Description:
--   Two things the game could not do without a deploy.
--
--   Every feature flag is an env var read at request time, and the NEXT_PUBLIC
--   ones are inlined at build time, so switching a game on means a redeploy or
--   a rebuild. That is a slow hand on a fast decision, and it means the flag
--   and the person deciding are never in the same place.
--
--   And there is no way at all to say something to players. No banner, no
--   announcement, no in-app message that is not a per-user notification. A
--   launch week has nothing to announce with.
--
--   Both tables are read by the game and written by the control panel, which is
--   why they live here in Boardly's own migration pipeline rather than beside
--   the panel's bookkeeping tables: they carry product state, not admin state.
--
--   RuntimeFlags does not replace the env vars. It overrides them when a row
--   exists, so an unset flag behaves exactly as it does today and the database
--   being unreachable cannot turn a game off.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Announcements" (
  "id"        TEXT PRIMARY KEY,
  "message"   TEXT        NOT NULL,
  "href"      TEXT,
  "tone"      TEXT        NOT NULL DEFAULT 'info',
  "active"    BOOLEAN     NOT NULL DEFAULT false,
  "startsAt"  TIMESTAMPTZ,
  "endsAt"    TIMESTAMPTZ,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Announcements_tone_check" CHECK ("tone" IN ('info', 'success', 'warning')),
  -- A banner with no text is a banner nobody can read, and an empty one would
  -- still take up the top of every page.
  CONSTRAINT "Announcements_message_not_blank" CHECK (length(btrim("message")) > 0)
);

-- The game asks one question on every render: is there a live announcement right
-- now. This index is that question.
CREATE INDEX IF NOT EXISTS "Announcements_active_window_idx"
  ON "Announcements" ("active", "startsAt", "endsAt");

CREATE TABLE IF NOT EXISTS "RuntimeFlags" (
  "key"       TEXT PRIMARY KEY,
  "enabled"   BOOLEAN     NOT NULL DEFAULT false,
  "note"      TEXT,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-only tables, like every other one in this schema: RLS on, one policy,
-- service_role only. Nothing here is reachable with the anon key that ships in
-- the client bundle.
DO $$
DECLARE
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  service_clause TEXT := '';
  t TEXT;
BEGIN
  IF has_service_role THEN service_clause := 'TO service_role'; END IF;

  FOREACH t IN ARRAY ARRAY['Announcements', 'RuntimeFlags'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role can manage %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Service role can manage %s" ON public.%I FOR ALL %s
         USING ((SELECT public.is_service_role()))
         WITH CHECK ((SELECT public.is_service_role()))',
      t, t, service_clause
    );
  END LOOP;
END
$$;
