-- ============================================================================
-- Migration: Harden RLS, normalize status/time types, and add admin audit logs
-- Date: 2026-02-28
-- Description:
--   1) Tighten public-facing RLS policies and enable RLS on GameStateSnapshots
--   2) Add AdminAuditLogs table with RLS policies
--   3) Normalize FriendRequests/Notifications statuses to enums
--   4) Add DB-level anti-spam guards for turn reminders
--   5) Add cleanup/performance indexes and one-time stale game cleanup
--   6) Convert core operational/gameplay timestamps to TIMESTAMPTZ
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUMS: normalize status/type columns
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FriendRequestStatus') THEN
    CREATE TYPE "FriendRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('game_invite', 'turn_reminder', 'friend_request', 'friend_accepted');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel') THEN
    CREATE TYPE "NotificationChannel" AS ENUM ('email');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationStatus') THEN
    CREATE TYPE "NotificationStatus" AS ENUM ('queued', 'processing', 'sent', 'skipped', 'failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'FriendRequests'
      AND c.column_name = 'status'
      AND c.udt_name = 'text'
  ) THEN
    UPDATE public."FriendRequests"
    SET "status" = CASE lower(trim(coalesce("status", 'pending')))
      WHEN 'pending' THEN 'pending'
      WHEN 'accepted' THEN 'accepted'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'pending'
    END
    WHERE "status" IS NULL
       OR lower(trim("status")) NOT IN ('pending', 'accepted', 'rejected', 'cancelled');

    -- Existing partial index uses text literal in predicate; recreate it after enum conversion.
    DROP INDEX IF EXISTS public."FriendRequests_pending_unordered_pair_unique_idx";

    ALTER TABLE public."FriendRequests"
      ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE public."FriendRequests"
      ALTER COLUMN "status" TYPE "FriendRequestStatus"
      USING ("status"::text::"FriendRequestStatus");

    ALTER TABLE public."FriendRequests"
      ALTER COLUMN "status" SET DEFAULT 'pending'::"FriendRequestStatus";

    CREATE UNIQUE INDEX IF NOT EXISTS "FriendRequests_pending_unordered_pair_unique_idx"
      ON public."FriendRequests"(
        LEAST("senderId", "receiverId"),
        GREATEST("senderId", "receiverId")
      )
      WHERE "status" = 'pending'::"FriendRequestStatus";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'Notifications'
      AND c.column_name = 'type'
      AND c.udt_name = 'text'
  ) THEN
    UPDATE public."Notifications"
    SET
      "type" = CASE lower(trim(coalesce("type", 'turn_reminder')))
        WHEN 'game_invite' THEN 'game_invite'
        WHEN 'turn_reminder' THEN 'turn_reminder'
        WHEN 'friend_request' THEN 'friend_request'
        WHEN 'friend_accepted' THEN 'friend_accepted'
        ELSE 'turn_reminder'
      END,
      "channel" = CASE lower(trim(coalesce("channel", 'email')))
        WHEN 'email' THEN 'email'
        ELSE 'email'
      END,
      "status" = CASE lower(trim(coalesce("status", 'queued')))
        WHEN 'queued' THEN 'queued'
        WHEN 'processing' THEN 'processing'
        WHEN 'sent' THEN 'sent'
        WHEN 'skipped' THEN 'skipped'
        WHEN 'failed' THEN 'failed'
        ELSE 'queued'
      END;

    ALTER TABLE public."Notifications"
      ALTER COLUMN "channel" DROP DEFAULT;
    ALTER TABLE public."Notifications"
      ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE public."Notifications"
      ALTER COLUMN "type" TYPE "NotificationType"
      USING ("type"::text::"NotificationType");
    ALTER TABLE public."Notifications"
      ALTER COLUMN "channel" TYPE "NotificationChannel"
      USING ("channel"::text::"NotificationChannel");
    ALTER TABLE public."Notifications"
      ALTER COLUMN "status" TYPE "NotificationStatus"
      USING ("status"::text::"NotificationStatus");

    ALTER TABLE public."Notifications"
      ALTER COLUMN "channel" SET DEFAULT 'email'::"NotificationChannel";
    ALTER TABLE public."Notifications"
      ALTER COLUMN "status" SET DEFAULT 'queued'::"NotificationStatus";
    ALTER TABLE public."Notifications"
      ALTER COLUMN "type" DROP DEFAULT;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- TIMESTAMPTZ normalization (phased core tables)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  column_to_upgrade RECORD;
BEGIN
  FOR column_to_upgrade IN
    SELECT *
    FROM (
      VALUES
        ('Users', 'emailVerified'),
        ('Users', 'lastActiveAt'),
        ('Users', 'createdAt'),
        ('Users', 'updatedAt'),
        ('Bots', 'createdAt'),
        ('Lobbies', 'createdAt'),
        ('LobbyInvites', 'sentAt'),
        ('LobbyInvites', 'acceptedAt'),
        ('LobbyInvites', 'createdAt'),
        ('LobbyInvites', 'updatedAt'),
        ('Games', 'abandonedAt'),
        ('Games', 'lastMoveAt'),
        ('Games', 'createdAt'),
        ('Games', 'updatedAt'),
        ('Players', 'createdAt'),
        ('FriendRequests', 'createdAt'),
        ('FriendRequests', 'updatedAt'),
        ('Friendships', 'createdAt'),
        ('GameStateSnapshots', 'createdAt'),
        ('OperationalEvents', 'occurredAt'),
        ('OperationalEvents', 'createdAt'),
        ('OperationalAlertStates', 'lastTriggeredAt'),
        ('OperationalAlertStates', 'lastNotifiedAt'),
        ('OperationalAlertStates', 'lastResolvedAt'),
        ('OperationalAlertStates', 'createdAt'),
        ('OperationalAlertStates', 'updatedAt'),
        ('NotificationPreferences', 'createdAt'),
        ('NotificationPreferences', 'updatedAt'),
        ('Notifications', 'processedAt'),
        ('Notifications', 'sentAt'),
        ('Notifications', 'createdAt'),
        ('Notifications', 'updatedAt')
    ) AS columns(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = column_to_upgrade.table_name
        AND c.column_name = column_to_upgrade.column_name
        AND c.data_type = 'timestamp without time zone'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE TIMESTAMPTZ(3) USING (%I AT TIME ZONE ''UTC'')',
        column_to_upgrade.table_name,
        column_to_upgrade.column_name,
        column_to_upgrade.column_name
      );
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Add AdminAuditLogs table (missing from prior migrations)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."AdminAuditLogs" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminAuditLogs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'AdminAuditLogs'
      AND c.conname = 'AdminAuditLogs_adminId_fkey'
  ) THEN
    ALTER TABLE public."AdminAuditLogs"
      ADD CONSTRAINT "AdminAuditLogs_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES public."Users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "AdminAuditLogs_adminId_createdAt_idx"
  ON public."AdminAuditLogs"("adminId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLogs_action_createdAt_idx"
  ON public."AdminAuditLogs"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLogs_targetType_createdAt_idx"
  ON public."AdminAuditLogs"("targetType", "createdAt");

-- ---------------------------------------------------------------------------
-- One-time stale data cleanup + indexes for recurring cleanup/reminders
-- ---------------------------------------------------------------------------

UPDATE public."Games"
SET
  "status" = 'cancelled'::"GameStatus",
  "updatedAt" = now()
WHERE "status" = 'waiting'::"GameStatus"
  AND "updatedAt" <= now() - interval '24 hours';

UPDATE public."Games"
SET
  "status" = 'abandoned'::"GameStatus",
  "abandonedAt" = COALESCE("abandonedAt", now()),
  "updatedAt" = now()
WHERE "status" = 'playing'::"GameStatus"
  AND (
    "lastMoveAt" <= now() - interval '24 hours'
    OR "updatedAt" <= now() - interval '24 hours'
  );

UPDATE public."Lobbies" l
SET
  "isActive" = false,
  "spectatorCount" = 0
WHERE l."isActive" = true
  AND NOT EXISTS (
    SELECT 1
    FROM public."Games" g
    WHERE g."lobbyId" = l.id
      AND g."status" IN ('waiting'::"GameStatus", 'playing'::"GameStatus")
  );

CREATE INDEX IF NOT EXISTS "Games_status_lastMoveAt_idx"
  ON public."Games"("status", "lastMoveAt");
CREATE INDEX IF NOT EXISTS "Games_status_updatedAt_idx"
  ON public."Games"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "Games_lobbyId_status_updatedAt_idx"
  ON public."Games"("lobbyId", "status", "updatedAt");

-- ---------------------------------------------------------------------------
-- Notification anti-spam / queue integrity safeguards
-- ---------------------------------------------------------------------------

WITH ranked_sent AS (
  SELECT
    n.id,
    ROW_NUMBER() OVER (
      PARTITION BY
        n."userId",
        n."dedupeKey",
        date_trunc('day', COALESCE(n."sentAt", n."createdAt"), 'UTC')
      ORDER BY COALESCE(n."sentAt", n."createdAt") DESC, n.id DESC
    ) AS rn
  FROM public."Notifications" n
  WHERE n."type" = 'turn_reminder'::"NotificationType"
    AND n."channel" = 'email'::"NotificationChannel"
    AND n."status" = 'sent'::"NotificationStatus"
    AND n."dedupeKey" IS NOT NULL
)
UPDATE public."Notifications" n
SET
  "status" = 'skipped'::"NotificationStatus",
  "reason" = COALESCE(n."reason", 'daily_dedupe_guard'),
  "processedAt" = COALESCE(n."processedAt", now()),
  "updatedAt" = now()
FROM ranked_sent r
WHERE n.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Notifications_queue_dedupe_idx"
  ON public."Notifications"("userId", "type", "channel", "dedupeKey")
  WHERE "dedupeKey" IS NOT NULL
    AND "status" IN ('queued'::"NotificationStatus", 'processing'::"NotificationStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "Notifications_turn_reminder_daily_sent_dedupe_idx"
  ON public."Notifications"(
    "userId",
    "dedupeKey",
    (date_trunc('day', COALESCE("sentAt", "createdAt"), 'UTC'))
  )
  WHERE "dedupeKey" IS NOT NULL
    AND "type" = 'turn_reminder'::"NotificationType"
    AND "channel" = 'email'::"NotificationChannel"
    AND "status" = 'sent'::"NotificationStatus";

CREATE INDEX IF NOT EXISTS "Notifications_turn_reminder_sentAt_idx"
  ON public."Notifications"("type", "status", "sentAt");

-- ---------------------------------------------------------------------------
-- RLS tightening: public-facing policies + snapshots/audit policies
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  anon_clause TEXT;
  authenticated_clause TEXT;
  service_clause TEXT;
  public_read_clause TEXT;
BEGIN
  anon_clause := CASE WHEN has_anon THEN 'TO anon' ELSE '' END;
  authenticated_clause := CASE WHEN has_authenticated THEN 'TO authenticated' ELSE '' END;
  service_clause := CASE WHEN has_service_role THEN 'TO service_role' ELSE '' END;
  public_read_clause := CASE
    WHEN has_anon AND has_authenticated THEN 'TO anon, authenticated'
    WHEN has_anon THEN 'TO anon'
    WHEN has_authenticated THEN 'TO authenticated'
    ELSE ''
  END;

  -- Users: keep policy names, tighten visibility of public rows.
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view public user info" ON public."Users"';
  EXECUTE 'DROP POLICY IF EXISTS "Anon users can view public user info" ON public."Users"';

  EXECUTE format(
    'CREATE POLICY "Authenticated users can view public user info"
       ON public."Users" FOR SELECT
       %s
       USING ("suspended" = false)',
    authenticated_clause
  );

  EXECUTE format(
    'CREATE POLICY "Anon users can view public user info"
       ON public."Users" FOR SELECT
       %s
       USING ("suspended" = false AND "isGuest" = false)',
    anon_clause
  );

  -- Lobbies: list only active lobbies to public roles.
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view lobbies" ON public."Lobbies"';
  EXECUTE format(
    'CREATE POLICY "Anyone can view lobbies"
       ON public."Lobbies" FOR SELECT
       %s
       USING ("isActive" = true)',
    public_read_clause
  );

  -- GameStateSnapshots: enable RLS + player-visible replay access + service management.
  EXECUTE 'ALTER TABLE public."GameStateSnapshots" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Players can view snapshots in their games" ON public."GameStateSnapshots"';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage game state snapshots" ON public."GameStateSnapshots"';

  EXECUTE format(
    'CREATE POLICY "Players can view snapshots in their games"
       ON public."GameStateSnapshots" FOR SELECT
       %s
       USING (
         EXISTS (
           SELECT 1
           FROM public."Players" p
           WHERE p."gameId" = "GameStateSnapshots"."gameId"
             AND p."userId" = (SELECT public.get_current_user_id())
         )
       )',
    authenticated_clause
  );

  EXECUTE format(
    'CREATE POLICY "Service role can manage game state snapshots"
       ON public."GameStateSnapshots" FOR ALL
       %s
       USING ((SELECT public.is_service_role()))
       WITH CHECK ((SELECT public.is_service_role()))',
    service_clause
  );

  -- AdminAuditLogs: enable RLS + admin read + service full management.
  EXECUTE 'ALTER TABLE public."AdminAuditLogs" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Admins can view audit logs" ON public."AdminAuditLogs"';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage admin audit logs" ON public."AdminAuditLogs"';

  EXECUTE format(
    'CREATE POLICY "Admins can view audit logs"
       ON public."AdminAuditLogs" FOR SELECT
       %s
       USING (
         EXISTS (
           SELECT 1
           FROM public."Users" u
           WHERE u.id = (SELECT public.get_current_user_id())
             AND u.role = ''admin''::"UserRole"
             AND u."suspended" = false
         )
       )',
    authenticated_clause
  );

  EXECUTE format(
    'CREATE POLICY "Service role can manage admin audit logs"
       ON public."AdminAuditLogs" FOR ALL
       %s
       USING ((SELECT public.is_service_role()))
       WITH CHECK ((SELECT public.is_service_role()))',
    service_clause
  );
END
$$;
