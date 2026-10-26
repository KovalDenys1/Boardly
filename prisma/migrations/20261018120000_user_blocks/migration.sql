-- ============================================================================
-- Migration: User blocks
-- Date: 2026-10-18
-- Description:
--   A signed-in player's list of players they do not want to read in chat (#1466).
--   Google Play's user-generated-content policy asks for a way to block abusive
--   users on top of the report channel (#1172). Chat history is filtered on the
--   client against this list, so a block hides the person's messages everywhere the
--   blocker plays, on every device they sign in on. Guests keep the same list on
--   their device instead and never get a row here.
--
--   Both user references are ON DELETE CASCADE: a block is the blocker's own
--   preference and means nothing once either account is gone (guests are purged
--   after three idle days). The unique index on (blockerId, blockedId) is the
--   deduplication behind POST /api/user/blocks; the index on blockedId serves the
--   cascade from the blocked side.
--
--   Additive: a new table, nothing existing is altered. Read and written only by
--   the server through Prisma, so it takes the same shape as every other
--   server-only table: RLS on, service_role only. No GRANT or REVOKE is needed:
--   since 20260924141000 the default privileges for anon and authenticated are
--   revoked in schema public, so a new table gets no API-role grant to take away
--   (scripts/rls-smoke.psql asserts it).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserBlocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBlocks_blockerId_blockedId_key" ON "UserBlocks"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "UserBlocks_blockedId_idx" ON "UserBlocks"("blockedId");

ALTER TABLE "UserBlocks" ADD CONSTRAINT "UserBlocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlocks" ADD CONSTRAINT "UserBlocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  service_clause TEXT;
BEGIN
  service_clause := CASE WHEN has_service_role THEN 'TO service_role' ELSE '' END;

  EXECUTE 'ALTER TABLE public."UserBlocks" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage user blocks" ON public."UserBlocks"';
  EXECUTE format(
    'CREATE POLICY "Service role can manage user blocks"
       ON public."UserBlocks" FOR ALL
       %s
       USING ((SELECT public.is_service_role()))
       WITH CHECK ((SELECT public.is_service_role()))',
    service_clause
  );
END
$$;
