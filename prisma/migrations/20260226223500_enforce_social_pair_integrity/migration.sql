-- ============================================================================
-- Migration: Enforce social pair integrity for friendships and friend requests
-- Date: 2026-02-26
-- Description:
--   1) Enforce canonical order and non-self pairs in Friendships
--   2) Prevent self friend requests
--   3) Prevent mirrored duplicate pending friend requests with unordered unique index
-- ============================================================================

-- Friendships are semantically unordered; keep one canonical row per pair.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("user1Id", "user2Id"), GREATEST("user1Id", "user2Id")
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM public."Friendships"
)
DELETE FROM public."Friendships" f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

UPDATE public."Friendships"
SET
  "user1Id" = LEAST("user1Id", "user2Id"),
  "user2Id" = GREATEST("user1Id", "user2Id")
WHERE "user1Id" > "user2Id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."Friendships" WHERE "user1Id" = "user2Id") THEN
    RAISE EXCEPTION 'Friendships contains self-pairs; cleanup required before adding constraints';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'Friendships'
      AND c.conname = 'Friendships_distinct_users_check'
  ) THEN
    ALTER TABLE public."Friendships"
      ADD CONSTRAINT "Friendships_distinct_users_check"
      CHECK ("user1Id" <> "user2Id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'Friendships'
      AND c.conname = 'Friendships_canonical_order_check'
  ) THEN
    ALTER TABLE public."Friendships"
      ADD CONSTRAINT "Friendships_canonical_order_check"
      CHECK ("user1Id" < "user2Id");
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."FriendRequests" WHERE "senderId" = "receiverId") THEN
    RAISE EXCEPTION 'FriendRequests contains self-requests; cleanup required before adding constraints';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."FriendRequests"
    WHERE "status" = 'pending'
    GROUP BY LEAST("senderId", "receiverId"), GREATEST("senderId", "receiverId")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'FriendRequests contains mirrored duplicate pending requests; cleanup required before adding unordered unique index';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'FriendRequests'
      AND c.conname = 'FriendRequests_distinct_users_check'
  ) THEN
    ALTER TABLE public."FriendRequests"
      ADD CONSTRAINT "FriendRequests_distinct_users_check"
      CHECK ("senderId" <> "receiverId");
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "FriendRequests_pending_unordered_pair_unique_idx"
ON public."FriendRequests" (
  LEAST("senderId", "receiverId"),
  GREATEST("senderId", "receiverId")
)
WHERE "status" = 'pending';
