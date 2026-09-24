-- Revoke the platform-default table grants from the public API roles (security audit 2026-09-24).
--
-- Supabase grants anon and authenticated full privileges on every table the postgres role creates
-- (pg_default_acl for role postgres in schema public); no migration here ever revoked them. RLS filters
-- rows, not columns, so the SELECT policies "Anyone can view lobbies" and "Anon users can view public
-- user info" exposed every column of Lobbies and Users through PostgREST and Postgres Changes.
--
-- The app never reads tables through the API roles: Prisma connects as the owner, the server broadcasts
-- with the service key, and the browser uses Realtime only. The three Postgres Changes subscriptions
-- (lobby list, per-lobby channel, per-game lobbies page) are all on Lobbies and only trigger a refetch;
-- Realtime delivers the columns the role may select, so a column-limited grant keeps them working.

DO $$
DECLARE
  api_roles TEXT := array_to_string(
    ARRAY_REMOVE(ARRAY[
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN 'anon' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN 'authenticated' END
    ], NULL),
    ', '
  );
BEGIN
  IF api_roles = '' THEN
    RAISE NOTICE 'anon/authenticated roles absent; nothing to revoke';
    RETURN;
  END IF;

  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %s', api_roles);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %s', api_roles);

  -- Tables created by future migrations must not inherit the grant again. Applies to objects created
  -- by the role running this migration, which is the role that runs every migration.
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %s', api_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %s', api_roles);

  -- The only read the browser needs: Postgres Changes on Lobbies (code is the channel filter).
  -- Never password, realtimeSecret, kickedUserIds or creatorId.
  EXECUTE format(
    'GRANT SELECT (id, code, name, "maxPlayers", "turnTimer", "isActive", "gameType", "createdAt", '
    || '"allowSpectators", "maxSpectators", "spectatorCount", theme) ON public."Lobbies" TO %s',
    api_roles
  );
END
$$;

-- Nothing reads Users through the API roles; these row filters only widened the exposure.
DROP POLICY IF EXISTS "Anon users can view public user info" ON "Users";
DROP POLICY IF EXISTS "Authenticated users can view public user info" ON "Users";
