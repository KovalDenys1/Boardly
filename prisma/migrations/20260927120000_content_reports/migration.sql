-- ============================================================================
-- Migration: Reports
-- Date: 2026-09-27
-- Description:
--   A player's report of something another player put on the site (#1172, audit
--   L5-02): a chat message, a Sketch & Guess drawing, or a username, avatar or bio.
--   ehandelsloven section 18 keeps the hosting safe harbour only while content is
--   acted on without undue delay once we know of it, which needs a channel for that
--   knowledge and a record to act on. POST /api/reports writes one row per reporter
--   and target; the Control Panel reviews them.
--
--   contentSnapshot keeps the reported content as it was, because chat lives 24
--   hours in Redis and a profile can be edited. The unique index on
--   (reporterId, targetKey) is the deduplication: a second report of the same
--   target by the same person is answered without a second row.
--
--   Both user references are ON DELETE SET NULL, not CASCADE: guests are purged
--   after three idle days, and a report has to outlive the account it is about.
--
--   Additive: a new table, nothing existing is altered. Read and written only by
--   the server through Prisma, so it takes the same shape as every other
--   server-only table: RLS on, service_role only. No GRANT or REVOKE is needed:
--   since 20260924141000 the default privileges for anon and authenticated are
--   revoked in schema public, so a new table gets no API-role grant to take away
--   (scripts/rls-smoke.psql asserts it).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "reportedUserId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "lobbyCode" TEXT,
    "gameId" TEXT,
    "round" INTEGER,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "contentSnapshot" TEXT,
    "snapshotSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedBy" TEXT,
    "discordMessageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Reports_status_createdAt_idx" ON "Reports"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Reports_reportedUserId_idx" ON "Reports"("reportedUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "Reports_reporterId_targetKey_key" ON "Reports"("reporterId", "targetKey");

ALTER TABLE "Reports" ADD CONSTRAINT "Reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reports" ADD CONSTRAINT "Reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  service_clause TEXT;
BEGIN
  service_clause := CASE WHEN has_service_role THEN 'TO service_role' ELSE '' END;

  EXECUTE 'ALTER TABLE public."Reports" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage content reports" ON public."Reports"';
  EXECUTE format(
    'CREATE POLICY "Service role can manage content reports"
       ON public."Reports" FOR ALL
       %s
       USING ((SELECT public.is_service_role()))
       WITH CHECK ((SELECT public.is_service_role()))',
    service_clause
  );
END
$$;
